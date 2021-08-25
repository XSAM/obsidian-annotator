import defineLocalIframe from 'defineLocalIframe';
import React from 'react';
import { AnnotationList, SpecificAnnotationProps } from 'types';
import { wait } from 'utils';

export default ({ vault, resourceUrls }) => {
    const LocalIframe = defineLocalIframe({ vault, resourceUrls });
    const GenericAnnotation = (props: SpecificAnnotationProps & { baseSrc: string }) => {
        async function loadAnnotations(url): Promise<AnnotationList> {
            const params = Object.fromEntries(url.searchParams.entries());
            if (params.uri == 'app://obsidian.md/index.html') {
                return { rows: [], total: 0 };
            }

            const tfile = vault.getAbstractFileByPath(props.annotationFile);
            const rows = [];

            const annotationRegex = /(^\n(>.*?\n)*?>```annotation-json(\n>.*?)*?)\n\^([a-zA-Z0-9]+)\n/gm;
            if (tfile) {
                const text = await vault.read(tfile);
                let m: RegExpExecArray;

                while ((m = annotationRegex.exec(text)) !== null) {
                    if (m.index === annotationRegex.lastIndex) {
                        annotationRegex.lastIndex++;
                    }
                    const contentRegex =
                        /(.|\n)*?%%\n```annotation-json\n((.|\n)*?)\n```\n%%(.|\n)*?\*%%PREFIX%%((.|\n)*?)%%HIGHLIGHT%% ==((.|\n)*?)== %%POSTFIX%%((.|\n)*?)\*\n%%LINK%%((.|\n)*?)\n%%COMMENT%%\n((.|\n)*?)\n%%TAGS%%\n((.|\n)*)/gm;

                    const content = m[1]
                        .split('\n')
                        .map(x => x.substr(1))
                        .join('\n');
                    const m2 = contentRegex.exec(content);
                    const annotation = JSON.parse(m2[2]);
                    const annotationTarget = annotation.target?.[0];
                    if (annotationTarget.selector) {
                        annotationTarget.selector = annotationTarget.selector.map(x =>
                            x.type == 'TextQuoteSelector' ? { ...x, prefix: m2[5], exact: m2[7], suffix: m2[9] } : x
                        );
                    }
                    annotation.text = m2[13];
                    annotation.tags = m2[15]
                        .split(',')
                        .map(x => x.trim().substr(1))
                        .filter(x => x);
                    if ([annotation.document?.documentFingerprint, annotation.uri].includes(params.uri)) {
                        rows.push(annotation);
                    }
                }
            }
            return { rows, total: rows.length };
        }

        async function deleteAnnotation(annotationId) {
            const tfile = vault.getAbstractFileByPath(props.annotationFile);
            if (tfile) {
                let text = await vault.read(tfile);
                let didReplace = false;
                const regex = new RegExp(
                    '(^\n(>.*?\n)*?>```annotation-json(\n>.*?)*?)\n\\^' + annotationId + '\n',
                    'gm'
                );
                text = text.replace(regex, () => {
                    didReplace = true;
                    return '';
                });
                if (didReplace) {
                    vault.modify(tfile, text);
                    return {
                        deleted: true,
                        id: annotationId
                    };
                }
            }

            return {
                deleted: false,
                id: annotationId
            };
        }

        async function writeAnnotation(annotation) {
            const annotationId = annotation.id ? annotation.id : Math.random().toString(36).substr(2);
            const res = JSON.parse(JSON.stringify(annotation));
            res.flagged = false;
            res.id = annotationId;
            let prefix = '';
            let exact = '';
            let suffix = '';
            annotation.target?.[0]?.selector?.forEach(x => {
                if (x.type == 'TextQuoteSelector') {
                    prefix = x.prefix || '';
                    exact = x.exact || '';
                    suffix = x.suffix || '';
                }
            });
            let annotationString =
                '%%\n```annotation-json' +
                `\n${JSON.stringify(res)}` +
                '\n```\n%%\n' +
                `*%%PREFIX%%${prefix.trim()}%%HIGHLIGHT%% ==${exact.trim()}== %%POSTFIX%%${suffix.trim()}*\n%%LINK%%[[#^${annotationId}|show annotation]]\n%%COMMENT%%\n${
                    annotation.text || ''
                }\n%%TAGS%%\n${annotation.tags.map(x => `#${x}`).join(', ')}`;
            annotationString =
                '\n' +
                annotationString
                    .split('\n')
                    .map(x => `>${x}`)
                    .join('\n') +
                '\n^' +
                annotationId +
                '\n';

            const tfile = vault.getAbstractFileByPath(props.annotationFile);
            if (tfile) {
                let text = await vault.read(tfile);
                let didReplace = false;
                const regex = new RegExp(
                    '(^\n(>.*?\n)*?>```annotation-json(\n>.*?)*?)\n\\^' + annotationId + '\n',
                    'gm'
                );
                text = text.replace(regex, () => {
                    didReplace = true;
                    return annotationString;
                });
                if (!didReplace) {
                    text = `${text}\n${annotationString}`;
                }
                vault.modify(tfile, text);
            } else {
                vault.create(props.annotationFile, annotationString);
            }
            return res;
        }

        return (
            <LocalIframe
                src={props.baseSrc}
                proxy={url => {
                    switch (url.hostname) {
                        case 'www.desmos.com':
                            return new URL(`zip:/www.desmos2.com${url.pathname}`);
                        case 'via.hypothes.is':
                            return new URL(`zip:/via.hypothes.is${url.pathname}`);
                        case 'hypothes.is':
                            return new URL(`zip:/hypothes.is${url.pathname}`);
                        case 'cdn.hypothes.is':
                            return new URL(`zip:/cdn.hypothes.is${url.pathname}`);
                        case 'proxy.pdfs.vault':
                            return new URL(`vault:/Pdfs${url.pathname}`);
                        default:
                            return url;
                    }
                }}
                fetchProxy={async ({ href, init, base }) => {
                    if (
                        href ==
                        `https://via.hypothes.is/proxy/static/xP1ZVAo-CVhW7kwNneW_oQ/1628964000/https://arxiv.org/pdf/1702.08734.pdf`
                    ) {
                        let path;
                        if (!('pdf' in props)) {
                            console.warn('Missing prop "pdf"');
                            return;
                        }
                        try {
                            path = new URL(props.pdf).href;
                        } catch {
                            path = `vault:/${props.pdf}`;
                        }
                        return await base(path);
                    }
                    if (href == `https://cdn.hypothes.is/demos/epub/content/moby-dick/book.epub`) {
                        let path;
                        if (!('epub' in props)) {
                            console.warn('Missing prop "epub"');
                            return;
                        }
                        try {
                            path = new URL(props.epub).href;
                        } catch {
                            path = `vault:/${props.epub}`;
                        }
                        return await base(path);
                    }
                    if (href == `https://hypothes.is/api/`) {
                        return await base(`zip:/fake-service/api.json`);
                    }
                    if (href == `http://localhost:8001/api/links`) {
                        return await base(`zip:/fake-service/api/links.json`);
                    }
                    if (href == `http://localhost:8001/api/profile`) {
                        return await base(`zip:/fake-service/api/profile.json`);
                    }
                    if (href.startsWith(`http://localhost:8001/api/profile/groups`)) {
                        return await base(`zip:/fake-service/api/profile/groups.json`);
                    }
                    if (href.startsWith(`http://localhost:8001/api/groups`)) {
                        return await base(`zip:/fake-service/api/groups.json`);
                    }
                    let res = null;
                    if (href.startsWith(`http://localhost:8001/api/search`)) {
                        res = await loadAnnotations(new URL(href));
                    }
                    if (href.startsWith(`http://localhost:8001/api/annotations`)) {
                        if (init.method == 'DELETE') {
                            res = await deleteAnnotation(href.substr(`http://localhost:8001/api/annotations/`.length));
                        } else {
                            res = await writeAnnotation(JSON.parse(init.body.toString()));
                        }
                    }
                    if (res) {
                        return new Response(JSON.stringify(res, null, 2), {
                            status: 200,
                            statusText: 'ok'
                        });
                    }
                    return await base(href);
                }}
                onDarkReadersUpdated={props.onDarkReadersUpdated}
                onload={async iframe => {
                    let sidebarFrame;
                    do {
                        await wait(100);
                        sidebarFrame =
                            iframe?.contentDocument
                                ?.querySelector('iframe')
                                ?.contentDocument?.querySelector('body > hypothesis-sidebar')
                                ?.shadowRoot?.querySelector('div > iframe') ||
                            iframe?.contentDocument
                                ?.querySelector('body > hypothesis-sidebar')
                                ?.shadowRoot?.querySelector('div > iframe');
                    } while (
                        sidebarFrame == null ||
                        !sidebarFrame?.contentDocument?.querySelector(
                            'body > hypothesis-app > div > div.TopBar > div > div.Menu > button > span > span.GroupList__menu-label'
                        )
                    );

                    const style = sidebarFrame.contentDocument.createElement('style');
                    style.textContent = `
        .AnnotationHeader__highlight {
            display: none!important;
        }
        
        .AnnotationShareInfo {
            display: none!important;
        }
        
        .AnnotationHeader__icon {
            display: none!important;
        }
        
        .TopBar__login-links {
            display: none!important;
        }
        
        body > hypothesis-app > div > div.TopBar > div > div.Menu {
            display: none!important;
        }
        
        body > hypothesis-app > div > div.TopBar > div > button {
            display: none!important;
        }`;
                    sidebarFrame.contentDocument.head.appendChild(style);

                    await props.onload(iframe);
                }}
            />
        );
    };
    return GenericAnnotation;
};

import type { RequestHandler } from '@umijs/bundler-utils/compiled/express';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { matchRoutes } from 'react-router-dom';
import { createServerRoutes } from './routes';
import { normalizeScripts } from './scripts';
import { normalizeStyles } from './styles';

export interface IOpts {
  base: string;
  routes: Record<
    string,
    {
      path: string;
      file: string;
      id: string;
      parentId?: string;
    }
  >;
  links?: Record<string, string>[];
  metas?: Record<string, string>[];
  styles?: (Record<string, string> | string)[];
  favicon?: string;
  headScripts?: (Record<string, string> | string)[];
  scripts?: (Record<string, string> | string)[];
  mountElementId?: string;
  esmScript?: boolean;
  modifyHTML?: (html: string, args: { path?: string }) => Promise<string>;
}

export async function getMarkup(
  opts: Omit<IOpts, 'routes'> & {
    path?: string;
  },
) {
  // TODO: use real component
  let markup = ReactDOMServer.renderToString(
    React.createElement('div', { id: opts.mountElementId || 'root' }),
  );

  function propsToString(opts: {
    props: Record<string, any>;
    filters?: string[];
  }) {
    return Object.keys(opts.props)
      .filter((key) => !(opts.filters || []).includes(key))
      .map((key) => `${key}=${JSON.stringify(opts.props[key])}`)
      .join(' ');
  }

  function getScriptContent(script: { src?: string; content?: string }) {
    const attrs = propsToString({
      props: script,
      filters: ['src', 'content'],
    });
    return script.src
      ? `<script${opts.esmScript ? ' type="module"' : ''} ${attrs} src="${
          script.src
        }"></script>`
      : `<script${opts.esmScript ? ' type="module"' : ''} ${attrs}>${
          script.content
        }</script>`;
  }

  function getStyleContent(style: { src?: string; content?: string }) {
    const attrs = propsToString({
      props: style,
      filters: ['src', 'content'],
    });
    return style.src
      ? `<link rel="stylesheet" ${attrs} href="${style.src}" />`
      : `<style ${attrs}>${style.content}</style>`;
  }

  function getTagContent(opts: {
    attrs: Record<string, string>;
    tagName: string;
  }) {
    const attrs = propsToString({
      props: opts.attrs,
    });
    return `<${opts.tagName} ${attrs} />`;
  }

  const favicon = opts.favicon
    ? `<link rel="shortcut icon" href="${opts.favicon}">`
    : '';
  const metas = (opts.metas || []).map((meta) =>
    getTagContent({ attrs: meta, tagName: 'meta' }),
  );
  const links = (opts.links || []).map((link) =>
    getTagContent({ attrs: link, tagName: 'link' }),
  );
  const styles = normalizeStyles(opts.styles || []).map(getStyleContent);
  const headScripts = normalizeScripts(opts.headScripts || []).map(
    getScriptContent,
  );
  const scripts = normalizeScripts(opts.scripts || []).map(getScriptContent);
  markup = [
    `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta
  name="viewport"
  content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0"
/>
<meta http-equiv="X-UA-Compatible" content="ie=edge" />`,
    metas.join('\n'),
    favicon,
    links.join('\n'),
    styles.join('\n'),
    headScripts.join('\n'),
    `</head>
<body>`,
    markup,
    scripts.join('\n'),
    `</body>
</html>`,
  ]
    .filter(Boolean)
    .join('\n');
  if (opts.modifyHTML) {
    markup = await opts.modifyHTML(markup, { path: opts.path });
  }
  return markup;
}

export function createRequestHandler(opts: IOpts): RequestHandler {
  return async (req, res, next) => {
    // 匹配路由，不匹配走 next()
    // TODO: cache
    const routes = createServerRoutes({
      routesById: opts.routes,
    });
    const matches = matchRoutes(routes, req.path, opts.base);
    if (matches) {
      res.set('Content-Type', 'text/html');
      const markup = await getMarkup({ ...opts, path: req.path });
      res.end(markup);
    } else {
      next();
    }
  };
}

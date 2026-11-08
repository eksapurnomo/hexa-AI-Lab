#!/usr/bin/env node
/**
 * HEXA AI Lab — Lightweight Production Builder for Dashboard
 * Compiles TypeScript TSX components via tsc and bundles them into a self-contained
 * browser bundle in dashboard/dist/ with zero external CDN dependencies.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const cjsOutDir = path.join(distDir, "_cjs");

// 1. Clean and prepare dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, "brand"), { recursive: true });
fs.mkdirSync(path.join(distDir, "styles"), { recursive: true });

// 2. Compile TSX files to CommonJS in dist/_cjs using tsc
execSync(
  `npx --yes -p typescript tsc --noEmit false --outDir "${cjsOutDir}" --module CommonJS --target ES2022 --jsx react`,
  { cwd: rootDir, stdio: "inherit" }
);

// 3. Copy static brand logo and CSS
const logoSrc = path.join(rootDir, "public", "brand", "inexa-teal-logo.png");
if (fs.existsSync(logoSrc)) {
  fs.copyFileSync(logoSrc, path.join(distDir, "brand", "inexa-teal-logo.png"));
}

const cssSrc = path.join(rootDir, "src", "styles", "dashboard.css");
fs.copyFileSync(cssSrc, path.join(distDir, "styles", "dashboard.css"));

// 4. Collect compiled CJS modules into a self-contained browser bundle
const moduleFiles = [
  ["./types/colab", path.join(cjsOutDir, "types", "colab.js")],
  ["./types/unsloth", path.join(cjsOutDir, "types", "unsloth.js")],
  ["./components/SidebarNav", path.join(cjsOutDir, "components", "SidebarNav.js")],
  ["./components/OverviewModule", path.join(cjsOutDir, "components", "OverviewModule.js")],
  ["./components/UnslothTrainingModule", path.join(cjsOutDir, "components", "UnslothTrainingModule.js")],
  ["./components/GoogleColabSettings", path.join(cjsOutDir, "components", "GoogleColabSettings.js")],
  ["./components/PlaceholderModules", path.join(cjsOutDir, "components", "PlaceholderModules.js")],
  ["./App", path.join(cjsOutDir, "App.js")],
];

let bundleJs = `(function() {
  "use strict";

  // Lightweight DOM-safe React runtime (uses createElement, setAttribute, textContent only)
  let hooksState = [];
  let hooksIndex = 0;
  let rootRenderFn = null;

  function scheduleRerender() {
    if (rootRenderFn) {
      rootRenderFn();
    }
  }

  const React = {
    useState: function(initialValue) {
      const idx = hooksIndex++;
      if (hooksState[idx] === undefined) {
        hooksState[idx] = typeof initialValue === "function" ? initialValue() : initialValue;
      }
      const setState = function(nextValue) {
        const resolved = typeof nextValue === "function" ? nextValue(hooksState[idx]) : nextValue;
        if (hooksState[idx] !== resolved) {
          hooksState[idx] = resolved;
          scheduleRerender();
        }
      };
      return [hooksState[idx], setState];
    },
    useCallback: function(fn) {
      return fn;
    },
    useEffect: function(effectFn) {
      const idx = hooksIndex++;
      if (!hooksState[idx]) {
        hooksState[idx] = true;
        setTimeout(function() {
          effectFn();
        }, 0);
      }
    },
    createElement: function(type, props) {
      const children = [];
      for (let i = 2; i < arguments.length; i++) {
        const arg = arguments[i];
        if (Array.isArray(arg)) {
          for (let j = 0; j < arg.length; j++) children.push(arg[j]);
        } else {
          children.push(arg);
        }
      }
      return { type: type, props: Object.assign({}, props || {}, { children: children }) };
    }
  };
  React.default = React;
  React.__esModule = true;

  function renderVNode(vnode) {
    if (vnode === null || vnode === undefined || vnode === false || vnode === true) {
      return document.createTextNode("");
    }
    if (typeof vnode === "string" || typeof vnode === "number") {
      return document.createTextNode(String(vnode));
    }
    if (typeof vnode.type === "function") {
      return renderVNode(vnode.type(vnode.props || {}));
    }
    const el = document.createElement(String(vnode.type));
    const props = vnode.props || {};
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = props[k];
      if (k === "children" || val === undefined || val === null || val === false) continue;
      if (k === "className") {
        el.setAttribute("class", String(val));
      } else if (k === "htmlFor") {
        el.setAttribute("for", String(val));
      } else if (k === "onClick" && typeof val === "function") {
        el.addEventListener("click", val);
      } else if (k === "onChange" && typeof val === "function") {
        el.addEventListener("change", val);
      } else if (k === "onSubmit" && typeof val === "function") {
        el.addEventListener("submit", val);
      } else if (k === "disabled") {
        if (val) el.setAttribute("disabled", "disabled");
      } else if (k === "value") {
        el.value = String(val);
        el.setAttribute("value", String(val));
      } else {
        el.setAttribute(k, String(val));
      }
    }
    const ch = props.children || [];
    for (let c = 0; c < ch.length; c++) {
      el.appendChild(renderVNode(ch[c]));
    }
    return el;
  }

  const modules = {};
  const cache = {};

  function requireModule(id) {
    if (id === "react") return React;
    const normalized = id.replace(/^\\.\\.\\//, "./");
    if (cache[normalized]) return cache[normalized].exports;
    const mod = { exports: {} };
    cache[normalized] = mod;
    if (!modules[normalized]) {
      throw new Error("Module not found: " + normalized);
    }
    modules[normalized](mod, mod.exports, requireModule);
    return mod.exports;
  }
`;

for (const [modId, filePath] of moduleFiles) {
  const code = fs.readFileSync(filePath, "utf8");
  bundleJs += `\n  modules[${JSON.stringify(modId)}] = function(module, exports, require) {\n${code}\n  };\n`;
}

bundleJs += `
  function mountDashboard() {
    const container = document.getElementById("hexa-root");
    if (!container) return;
    const params = new URLSearchParams(window.location.search);
    const initialMod = params.get("module") || "overview";
    const AppMod = requireModule("./App");
    const AppComp = AppMod.App || AppMod.default;

    rootRenderFn = function() {
      hooksIndex = 0;
      const tree = React.createElement(AppComp, {
        adminToken: "demo-local-preview",
        csrfToken: "demo-csrf-token",
        initialModule: initialMod
      });
      const domNode = renderVNode(tree);
      container.replaceChildren(domNode);
    };

    rootRenderFn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDashboard);
  } else {
    mountDashboard();
  }
})();
`;

fs.writeFileSync(path.join(distDir, "app.bundle.js"), bundleJs, "utf8");
fs.rmSync(cjsOutDir, { recursive: true, force: true });

// 5. Write index.html in dist/
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:3001; object-src 'none';" />
  <title>HEXA AI Lab — Fine-Tuning &amp; Compute Studio</title>
  <link rel="stylesheet" href="/styles/dashboard.css" />
</head>
<body>
  <div id="hexa-root"></div>
  <script src="/app.bundle.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(distDir, "index.html"), indexHtml, "utf8");
console.log("[Dashboard Build] Successfully built production assets into dashboard/dist/");

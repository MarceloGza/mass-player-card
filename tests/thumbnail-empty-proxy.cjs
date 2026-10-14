const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (id) => dependencies[id] ?? {},
    document: {
      location: {
        protocol: "https:",
        hostname: "home.example",
        href: "https://home.example/",
      },
    },
    window: { location: { protocol: "https:" } },
    console,
  });
  return exports;
}
const url = load("src/utils/url.ts");
const thumbnails = load("src/utils/thumbnails.ts", {
  "./url": url,
  "../const/enums": { Thumbnail: { CLEFT: "cleft" } },
  "../const/common": {
    LightModeThumbnails: { cleft: "data:image/svg+xml;base64,AA==" },
    DarkModeThumbnails: { cleft: "data:image/svg+xml;base64,AA==" },
  },
});
(async () => {
  let calls = [];
  const hass = {
    themes: { darkMode: false },
    callWS: async (request) => {
      calls.push(request);
      return "data:image;base64,encoded";
    },
  };
  assert.equal(
    await thumbnails.encodeImageIfLocal(hass, "", true),
    "",
    "Missing artwork must not be proxied",
  );
  assert.equal(
    calls.length,
    0,
    "Blank image must not produce native InvalidUrlClientError",
  );
  assert.equal(await thumbnails.encodeImageIfLocal(hass, "  ", true), "");
  assert.equal(await thumbnails.encodeImageIfLocal(hass, undefined, true), "");
  assert.equal(calls.length, 0);
  const fallback = await thumbnails.asyncImageURLWithFallback(
    hass,
    "",
    "cleft",
    true,
    true,
  );
  assert.equal(fallback.image_url, "");
  assert.equal(fallback.fallback_url, "data:image/svg+xml;base64,AA==");
  assert.equal(calls.length, 0);
  assert.equal(
    await thumbnails.encodeImageIfLocal(
      hass,
      "https://images.example/cover.jpg",
      true,
    ),
    "data:image;base64,encoded",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://images.example/cover.jpg");
  assert.equal(
    await thumbnails.encodeImageIfLocal(
      hass,
      "https://images.example/direct.jpg",
      false,
    ),
    "https://images.example/direct.jpg",
  );
  assert.equal(calls.length, 1);
  const api = await thumbnails.asyncImageURLWithFallback(
    hass,
    "/api/image_proxy/test",
    "cleft",
    true,
    true,
  );
  assert.equal(api.image_url, "/api/image_proxy/test");
  assert.equal(calls.length, 1);
  assert.equal(
    await thumbnails.encodeImageIfLocal(
      hass,
      "http://192.168.1.10/cover.jpg",
      false,
    ),
    "data:image;base64,encoded",
  );
  assert.equal(
    calls.length,
    2,
    "Mixed-content image must retain native proxy behavior",
  );
  console.log(
    "PASS blank/nonstring/no-call, fallback, valid proxied/direct, HA API and mixed-content controls",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

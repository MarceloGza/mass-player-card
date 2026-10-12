import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source = fs.readFileSync(process.argv[2], "utf8");
function extract(prefix) {
  const start = source.indexOf(prefix, source.indexOf("renderActiveItem(){"));
  assert(start >= 0, prefix);
  let i = source.indexOf("{", start) + 1, depth = 1;
  for (; depth; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
  }
  return source.slice(start, i);
}
const methods = extract("renderActiveItem(){") + extract("render(){");
const context = {};
for (const match of methods.matchAll(/_\$litType\$:(\w+)/g)) context[match[1]] = match[1];
const C = vm.runInNewContext("class C{" + methods + "};C", context);
const c = new C();
c.playerConfig = { layout: { artwork_size: "small" } };
c.Config = { panel: false };
c.renderEmptyQueue = () => "EMPTY_ARTWORK";
const captured = JSON.parse(fs.readFileSync(process.argv[3], "utf8")).find(x => x.entity_id === "media_player.house");
assert(captured.attributes.entity_picture);
c.activePlayer = { ...captured, state: "playing", attributes: { ...captured.attributes, active_queue: null } };
c.queue = [];
let result = c.renderActiveItem();
assert.notEqual(result, "EMPTY_ARTWORK", "External playback image must not require native queue");
assert(result.values.includes(captured.attributes.entity_picture));
for (const state of ["playing", "paused"]) {
  c.activePlayer.state = state;
  assert(c.renderActiveItem().values.includes(captured.attributes.entity_picture));
}
c.activePlayer.attributes.entity_picture_local = "/local/current-cover.jpg";
assert(c.renderActiveItem().values.includes("/local/current-cover.jpg"));
for (const state of ["idle", "unavailable", "unknown", "off"]) {
  c.activePlayer.state = state;
  assert.equal(c.renderActiveItem(), "EMPTY_ARTWORK", state);
}
c.activePlayer.state = "playing";
delete c.activePlayer.attributes.entity_picture;
delete c.activePlayer.attributes.entity_picture_local;
assert.equal(c.renderActiveItem(), "EMPTY_ARTWORK", "Missing artwork retains placeholder");
c.activePlayer.attributes.entity_picture = captured.attributes.entity_picture;
c.queue = [{ playing: true, queue_item_id: "native-item" }];
c.activePlayer.attributes.active_queue = "house";
assert(c.renderActiveItem().values.includes("native-item"));
c.activePlayer.attributes.active_queue = null;
assert(!c.renderActiveItem().values.includes("native-item"), "Stale native queue must not control external artwork");
assert(c.render().values.includes(captured.attributes.entity_picture), "External mode bypasses native carousel");
c.activePlayer.attributes.active_queue = "house";
assert(c.render().values.some(x => x?.values?.includes("native-item")), "Native carousel returns after source switch");
console.log("PASS captured external artwork, playing/paused, local image, missing image, inactive states, native/external/native source transitions");

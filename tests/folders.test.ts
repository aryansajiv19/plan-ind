import assert from "node:assert/strict";
import test from "node:test";
import { groupByFolder } from "../lib/social/folders.ts";

test("lists group under their folder; the rest, and any unknown folder id, go to Unfiled last", () => {
  const folders = [{ id: "f1", name: "Date nights", emoji: "💘" }, { id: "f2", name: "Empty", emoji: "📁" }];
  const groups = groupByFolder(folders, [
    { kind: "board", id: "b", name: "Rooftops", folderId: "f1" },
    { kind: "been", id: "c", name: "2026", folderId: null },
    { kind: "saved", id: "s", name: "Want to try", folderId: "gone" },
  ]);
  assert.deepEqual(groups.map((g) => [g.folder?.name ?? "Unfiled", g.lists.map((l) => l.id)]),
    [["Date nights", ["b"]], ["Empty", []], ["Unfiled", ["c", "s"]]]);
  assert.deepEqual(groupByFolder(folders, [{ kind: "board", id: "b", name: "x", folderId: "f1" }]).map((g) => g.folder?.id), ["f1", "f2"], "no empty Unfiled");
});

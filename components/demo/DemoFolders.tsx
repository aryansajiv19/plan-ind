import { DEMO_BOARDS } from "@/components/demo/DemoMoodboards";

// The demo's Saved tab: sample folders holding the demo boards, in the real
// FoldersSection's markup (section.saved-folders, .saved-folders__group) so
// they take the same folder styling. Sample data, labelled as such; nothing
// here is anyone's, and nothing is saved.
const [birthday, weekend] = DEMO_BOARDS;
const FOLDERS = [
  { name: "Birthdays", lists: [{ name: birthday.name, kind: "Moodboard" }] },
  { name: "Weekend escapes", lists: [{ name: weekend.name, kind: "Moodboard" }] },
  { name: "Someday", lists: [{ name: "Want to try", kind: "Saved links" }] },
];

export default function DemoFolders() {
  return (
    <section className="saved-folders" aria-labelledby="demo-folders-title">
      <h2 id="demo-folders-title">Saved, in folders</h2>
      {FOLDERS.map((folder) => (
        <div key={folder.name} className="saved-folders__group">
          <h3>{folder.name}</h3>
          <ul>
            {folder.lists.map((list) => (
              <li key={list.name}><span>{list.name} · {list.kind}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

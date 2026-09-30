import { categoryName } from "@/components/categoryGroups";

// A place with no photo gets a quiet printed card, never a stand-in scene:
// the kind of place ("Japanese", else "Padel") set in the display italic on
// a flat surface. Every caller prints the venue's name on or beside it, so
// the name is never repeated here. Fills its positioned parent like a photo.
export default function CategoryArt({ category, cuisine, className = "" }: { category: string; cuisine?: string | null; className?: string }) {
  return (
    <span className={`category-art ${className}`.trim()} aria-hidden="true">
      <span className="category-art__word">{cuisine?.split(",")[0] || categoryName(category)}</span>
    </span>
  );
}

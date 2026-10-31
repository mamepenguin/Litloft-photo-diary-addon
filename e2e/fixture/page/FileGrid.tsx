// Stands in for the core's FileGrid: tiles of a fixed height, each a link to a file page.
import Link from "./link";

export function FileGrid({ files }: { files: { id: string; filename: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {files.map((file) => (
        <Link key={file.id} href={`?file=${file.id}`} className="block h-40 rounded-xl bg-bg-elevated p-2" data-testid="tile">
          {file.filename}
        </Link>
      ))}
    </div>
  );
}

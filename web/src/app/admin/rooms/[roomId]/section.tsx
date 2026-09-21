import type { ReactNode } from "react";

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const style = kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700";
  return <div className={`mb-4 rounded-lg border p-3 text-sm ${style}`}>{children}</div>;
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-balance text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

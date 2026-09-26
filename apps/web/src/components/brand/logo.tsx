export function BrandLogo({ compact = false, official = false }: { compact?: boolean; official?: boolean }) {
  const src = official
    ? "/brand/cercle-complet-logo-official.png"
    : compact
      ? "/brand/cercle-complet-mark.svg"
      : "/brand/cercle-complet-logo.svg";
  return (
    <span className="inline-flex items-center">
      <img
        src={src}
        alt="Cercle Complet Sarl"
        className={
          official
            ? "h-auto w-40 object-contain transition-[filter] duration-300 dark:brightness-[1.85] dark:saturate-[0.9] dark:drop-shadow-[0_2px_8px_rgb(96_165_250/0.16)] sm:w-48"
            : compact
              ? "h-9 w-9"
              : "h-10 w-auto max-w-[13rem]"
        }
      />
    </span>
  );
}

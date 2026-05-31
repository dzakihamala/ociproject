interface LoaderProps {
  className?: string;
}

export function Loader({ className = '' }: LoaderProps) {
  return (
    <div className={`min-h-[48px] flex items-center justify-center ${className}`}>
      <div className="border-2 border-border border-t-primary rounded-full w-5 h-5 animate-spin mx-auto my-4" />
    </div>
  );
}

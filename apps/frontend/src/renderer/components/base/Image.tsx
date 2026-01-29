interface ImageProps {
  src?: string;
  alt?: string;
  fit?: 'cover' | 'contain' | 'fill' | 'none';
  className?: string;
}

const fitClasses = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
  none: 'object-none',
};

export function Image({
  src,
  alt = '',
  fit = 'cover',
  className = '',
}: ImageProps) {
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={`${fitClasses[fit]} ${className}`}
    />
  );
}

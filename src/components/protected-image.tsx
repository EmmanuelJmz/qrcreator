import React, { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/src/lib/api-client';

interface ProtectedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export const ProtectedImage = React.memo(function ProtectedImage({
  src,
  alt,
  className,
  ...rest
}: ProtectedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setFailed(false);

    fetch(src, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Image fetch failed');
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt || 'Imagen no disponible'}
        className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className || ''}`}
      >
        Vista previa no disponible
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={`bg-slate-100 animate-pulse ${className || ''}`} />;
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      {...rest}
    />
  );
});

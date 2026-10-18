import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Interim',
    short_name: 'Interim',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#4f46e5',
  };
}

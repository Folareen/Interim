import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Interim',
    short_name: 'Interim',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f0e8',
    theme_color: '#f4f0e8',
  };
}

// 照片详情路由形如 /:photoId（单段，photoId 已编码，不含 "/"），相对于 router basename。
const PHOTO_DETAIL_PATHNAME_PATTERN = /^\/[^/]+\/?$/;

export function buildPhotoDetailPathname(photoId: string): string {
  return `/${encodeURIComponent(photoId)}`;
}

export function isPhotoDetailPathname(pathname: string): boolean {
  return PHOTO_DETAIL_PATHNAME_PATTERN.test(pathname);
}

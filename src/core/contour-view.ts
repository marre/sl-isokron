// Sparse overview delivery is worthwhile only for expensive, zoomed-out views.
// Detailed views always retain every native minute and coordinate.
export function useContourOverview(zoom:number,files:number,bytes:number):boolean {
  return zoom<=12&&files>=48&&bytes>=2*1024*1024;
}

declare module "wkt" {
  export function parse(wkt: string): any;
  export function stringify(geojson: any): string;
}

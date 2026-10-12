export interface BrandConfig {
  appName: string;
  shortName: string;
  logoText: string;
  tagline: string;
  copyright: string;
  defaultClientName: string;
  placeholderSearchText: string;
  catalogTitle: string;
}

export const BRAND_CONFIG: BrandConfig = {
  appName: "SAS Manager",
  shortName: "SAS",
  logoText: "SAS Manager",
  tagline: "Track sales proposals, manage delivery lead times, and monitor customer conversions with absolute precision.",
  copyright: "SAS Manager. All rights reserved.",
  defaultClientName: "General Client",
  placeholderSearchText: "Type to search customer accounts...",
  catalogTitle: "Standard Component Catalog"
};

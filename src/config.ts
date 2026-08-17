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
  appName: "Enquiry Manager",
  shortName: "Enquiry",
  logoText: "Enquiry Manager",
  tagline: "Track sales proposals, manage delivery lead times, and monitor customer conversions with absolute precision.",
  copyright: "Enquiry Manager. All rights reserved.",
  defaultClientName: "General Client",
  placeholderSearchText: "Type to search customer accounts...",
  catalogTitle: "Standard Component Catalog"
};

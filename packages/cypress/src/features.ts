export enum PluginFeature {
  Plugin = "plugin",
  Support = "support",
  Metrics = "metrics",
  Upload = "upload",
}

type PluginFeatureOption = PluginFeature | `no-${PluginFeature}` | "none" | "all";

function isValidFeatureOption(feature: string): feature is PluginFeatureOption {
  if (["all", "none"].includes(feature)) {
    return true;
  }

  if (feature.startsWith("no-")) {
    feature = feature.substring(3);
  }

  return Object.values(PluginFeature).includes(feature as PluginFeature);
}

function parsePluginFeatureOptions(options: string) {
  return options
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .filter(s => isValidFeatureOption(s)) as PluginFeatureOption[];
}

export function getFeatures(options: string | undefined) {
  const allFeatures = Object.values(PluginFeature);

  if (options) {
    return parsePluginFeatureOptions(options).reduce<PluginFeature[]>((acc, feature) => {
      if (feature === "all") {
        return allFeatures;
      } else if (feature === "none") {
        return [];
      } else if (feature.startsWith("no-")) {
        feature = feature.substring(3) as PluginFeatureOption;

        if (acc.includes(feature as PluginFeature)) {
          return acc.filter(f => f !== feature);
        }
      } else if (!acc.includes(feature as any)) {
        acc.push(feature as PluginFeature);
      }

      return acc;
    }, []);
  }

  return allFeatures;
}

export function isFeatureEnabled(options: string | undefined, feature: PluginFeature) {
  const features = getFeatures(options);

  return features.includes(feature);
}

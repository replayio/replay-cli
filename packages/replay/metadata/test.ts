const VERSION = 1;

const versions: Record<number, (metadata: Record<string, unknown>) => void> = {
  1: function v1(metadata: Record<string, unknown>) {
    if (!metadata.title) {
      throw new Error("test title is required")
    }
  
    if (!metadata.result) {
      throw new Error("test result is required")
    }
  }
};

function sanitize(data: Record<string, unknown>) {
  const updated = {...data};
  if (!updated.version) {
    updated.version = VERSION;
  }

  if (typeof updated.version === "number" && versions[updated.version]) {
    versions[updated.version](updated);
  } else {
    throw new Error(`Test metadata version ${updated.version} not supported`);
  }

  return updated;
}

export default sanitize;

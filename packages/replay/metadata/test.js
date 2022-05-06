const VERSION = 1;

const versions = {
  1: function v1(metadata) {
    if (!metadata.title) {
      throw new Error("test title is required")
    }
  
    if (!metadata.result) {
      throw new Error("test result is required")
    }
  }
};

function sanitize({test: data}) {
  const updated = {...data};
  if (!updated.version) {
    updated.version = VERSION;
  }

  if (versions[updated.version]) {
    versions[updated.version](updated);
  } else {
    throw new Error(`Test metadata version ${updated.version} not supported`);
  }

  return {
    test: updated
  };
}

module.exports = sanitize;
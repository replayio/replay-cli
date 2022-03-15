function comment({github, context, issue_number, recordings}) {
  const {
    repo: {owner, repo},
  } = context;

  if (!issue_number) {
    console.log('No issue number');
    return;
  }

  if (!recordings || recordings.length === 0) {
    console.log('No recordings created');
    return;
  }

  return github.rest.issues.createComment({
    issue_number,
    owner,
    repo,
    body: `### Failed Tests

${recordings
  .map(
    ({id, title}) => `[${title || id}](https://app.replay.io/recording/${id})`
  )
  .join('\n')}`,
  });
}

module.exports = comment;

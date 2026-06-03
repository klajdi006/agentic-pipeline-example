// Minimal Linear GraphQL client. Gated by LINEAR_API_KEY — with no key it no-ops
// (returns null), so the pipeline runs fully offline.
//
// Get a FREE personal API key (works on Linear's Free plan):
//   linear.app → Settings → Security & access → Personal API keys → New key
// Then, in the shell you run the pipeline from:
//   export LINEAR_API_KEY=lin_api_xxxxxxxx
//   export LINEAR_TEAM_ID=...        # optional; otherwise the first team is used
//
// Personal API keys go in the Authorization header verbatim (NOT "Bearer ...").

const API = 'https://api.linear.app/graphql';

export function linearEnabled() {
  return !!process.env.LINEAR_API_KEY;
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: process.env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error('Linear API error: ' + JSON.stringify(json.errors));
  return json.data;
}

async function resolveTeamId() {
  if (process.env.LINEAR_TEAM_ID) return process.env.LINEAR_TEAM_ID;
  const d = await gql(`query { teams(first: 1) { nodes { id } } }`);
  const id = d.teams?.nodes?.[0]?.id;
  if (!id) throw new Error('No Linear team found for this API key.');
  return id;
}

export async function createIssue({ title, description }) {
  if (!linearEnabled()) return null;
  const teamId = await resolveTeamId();
  const d = await gql(
    `mutation($teamId:String!,$title:String!,$description:String){
       issueCreate(input:{teamId:$teamId,title:$title,description:$description}){
         success issue { id identifier url }
       }
     }`,
    { teamId, title, description }
  );
  return d.issueCreate?.issue ?? null;
}

export async function addComment(issueId, body) {
  if (!linearEnabled() || !issueId) return null;
  const d = await gql(
    `mutation($issueId:String!,$body:String!){
       commentCreate(input:{issueId:$issueId,body:$body}){ success comment { id } }
     }`,
    { issueId, body }
  );
  return d.commentCreate?.comment ?? null;
}

// Fetch the current workflow state of an issue.
export async function getIssueState(issueId) {
  if (!linearEnabled() || !issueId) return null;
  const d = await gql(
    `query($id:String!){
       issue(id:$id){
         state { id name type }
       }
     }`,
    { id: issueId }
  );
  return d.issue?.state ?? null;
}

// Move an issue to a completed workflow state (returns the state name, or null).
export async function markDone(issueId) {
  if (!linearEnabled() || !issueId) return null;
  const d = await gql(
    `query($id:String!){ issue(id:$id){ team { states(first:50){ nodes { id name type } } } } }`,
    { id: issueId }
  );
  const states = d.issue?.team?.states?.nodes ?? [];
  const done = states.find((s) => s.type === 'completed') ?? states.find((s) => /done/i.test(s.name));
  if (!done) return null;
  await gql(
    `mutation($id:String!,$stateId:String!){ issueUpdate(id:$id, input:{stateId:$stateId}){ success } }`,
    { id: issueId, stateId: done.id }
  );
  return done.name;
}

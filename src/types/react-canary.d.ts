// React's <ViewTransition> ships in the React channel Next vendors
// for the App Router, but its types live behind the canary entry.
// One reference, project-wide, so `import { ViewTransition } from
// "react"` typechecks everywhere.
/// <reference types="react/canary" />

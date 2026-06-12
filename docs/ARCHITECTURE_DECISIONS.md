# Architecture Decisions

## ADR-0001: FetchXML Builder Authoring and Execution Model

Date: 2026-06-12

Status: Accepted

### Context

OpenDataverse needs a new Advanced Find-style module that lets users choose a
base Dataverse table, use a Dynamics model-driven app-style filter expression
builder, inspect results, and export the query artifact.

The module should support both a visual designer and manual FetchXML authoring.
It should also produce a runnable Dataverse Web API link when possible.

Current Microsoft Dataverse documentation confirms that FetchXML can be executed
through the Web API by URL-encoding the FetchXML query and passing it to the
base entity set with the `fetchXml` query parameter.

References:

- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/overview
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/filter-rows
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/join-tables
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/retrieve-data
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/reference/operators
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api

### Decision

Use FetchXML as the canonical query artifact for the module.

The visual Designer should mirror the modern Dynamics/model-driven app filter
expression builder rather than expose a generic FetchXML-builder interface. The
primary UI model is:

- `Add row`
- `Add group`
- `Add related table`
- default `And` groups with `Or` available where Dynamics exposes it
- selectable rows/groups with more-menu actions such as grouping and ungrouping
- related table selection from relationship metadata

The module will expose two authoring tabs:

- `Designer`: a Dynamics-style visual filter builder for base entity, selected
  columns, sort order, rows, condition groups, and related table blocks.
- `FetchXML`: an editable Monaco XML editor where the user can manually write
  or modify FetchXML and execute it directly.

The tabs share execution and output surfaces but do not synchronize state back
from manual XML into the visual designer. Designer changes can regenerate the
FetchXML editor contents, but manual FetchXML edits are treated as a separate
source mode.

Manual FetchXML execution runs the query as it was written. The app must not
silently inject `top`, `count`, paging, or other limiting attributes into
manually authored XML.

Designer-generated queries include a visible `Rows` control. The default is
`100`, emitted as `count="100"` in Designer-generated FetchXML.

The Designer includes explicit output column selection in v1. The selector must
handle entities with hundreds of columns by using searchable/paginated or
virtualized selection UI rather than rendering every available column in the
main builder surface.

Related table filters follow the Dynamics expression-builder model. Related
tables are selected from Dataverse relationship metadata starting at the current
table context. The selection UI should show the related column/table, target
table, relationship type, and lookup columns where useful.

The Designer should mirror Dynamics related-table filter behavior: related table
blocks use the Dynamics-style `Contains data` semantics in the visual UI.
Negative or specialized existential FetchXML link semantics are manual FetchXML
concerns, not first-class Designer controls.

The related table list must not be a raw dump of all relationship metadata.
Filter entities and columns to Advanced Find-visible metadata where available,
and group related table choices by relationship type in the same spirit as the
Dynamics filter screen.

Operator and value controls should follow the current Dynamics filter screen,
not a custom exhaustive FetchXML operator matrix. After the user selects a
column, show the conditional operators and value picker/input style that
Dynamics would expose for that column type. Conditions such as `Contains data`
do not require a comparison value. Choice/status columns use selectable option
values. Related table blocks use `Contains data` in the visual UI.

The main Designer must not expose raw FetchXML link-type choices as the primary
interaction. FetchXML-only capabilities remain available in the editable
FetchXML tab.

Execution output should include:

- a result set rendered as a table
- the current editable FetchXML in Monaco
- a Web API URL in the form:

```text
{environmentUrl}/api/data/v9.2/{entitySetName}?fetchXml={encodeURIComponent(fetchXml)}
```

When executing from the `FetchXML` tab, infer the base entity from the root
`<entity name="...">`, resolve that logical name to `EntitySetName` from
Dataverse metadata, and use the resolved entity set for the Web API request.

Result table columns are dynamic. Designer-generated queries should prefer the
selected column order from the visual builder. Manual FetchXML results should
infer columns from the returned JSON keys, preserve raw API key names for
unknown or aliased values, and apply display labels only when metadata is
available.

### Consequences

FetchXML remains the stable export and execution artifact, avoiding lossy
translation into OData for joins, nested link-entities, relationship filters,
and operator-specific behavior.

The first implementation can avoid full FetchXML-to-designer round-tripping.
That parser can be added later behind an explicit `Load Into Designer` action if
the use case becomes important.

Manual XML can request large result sets because it executes exactly as written.
The UI may warn before execution when the query has no visible limiting or
paging attributes, but it must not rewrite the XML. Designer-generated XML uses
the visible `Rows` control instead.

# Plugin Registration Manual QA

Use a disposable unmanaged Dataverse development environment.

## Setup

- Select the target environment in OpenDataverse and confirm it is connected.
- Use an unmanaged solution for any solution-add checks.
- Use a small test plug-in assembly with at least one `Microsoft.Xrm.Sdk.IPlugin` type.

## Smoke Checks

- Open Plugin Registration and confirm assemblies, types, steps, images, messages, filters, endpoints, users, and packages load.
- Inspect the test DLL and confirm assembly name, version, culture, public key token, target framework, hash, size, and discovered types appear.
- Register the test assembly and selected type into the unmanaged solution.
- Register a NuGet plug-in package whose id starts with the selected unmanaged solution's publisher prefix. Confirm its assembly and types appear under the package, then update it with the same package id and version.
- Create a synchronous Update step for `account` with filtering attributes and unsecure configuration.
- Confirm the Message picker is alphabetical, puts an exact typed match first, and excludes messages without a visible filter that allows custom steps.
- Save secure configuration on the step, refresh, and confirm only secure config presence is shown.
- Add a pre-image for the Update step and confirm attributes persist.
- Disable and re-enable the step.
- Create a webhook/service endpoint and register an endpoint-bound step.
- Load dependencies for the assembly, plug-in type, step, image, and endpoint.
- Export the selected registration snapshot to JSON.
- Delete the image, endpoint step, endpoint, plug-in step, plug-in type, and assembly.
- Unregister the test plug-in package after removing its steps.

## Guard Checks

- Attempt to edit or unregister a managed registration and confirm OpenDataverse blocks the action.
- Attempt to add a pre-image to a Create step and confirm the action is rejected.
- Leave filtering attributes empty on an Update step and confirm the UI leaves the value explicit rather than fabricating a field list.

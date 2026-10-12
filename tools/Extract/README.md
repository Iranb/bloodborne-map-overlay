# Optional offline extractor — GPL-3.0

This directory retains its own [GPL-3.0 license](LICENSE). It uses current SoulsFormats for Bloodborne MSB/PARAM/FMG and the legacy Bloodborne HKX parser from MVDX_Classic. It is separate from the MIT desktop runtime and is not included in the desktop download.

From the repository root, run `./tools/Extract/prepare-dependencies.ps1`. The script downloads pinned upstream source revisions into ignored `artifacts/dependencies`, builds them and places local assemblies in ignored `tools/lib`. It requires Git, the .NET 10 SDK and internet access. The upstream source and license files stay with the downloaded checkouts.

- SoulsFormats: `JKAnderson/SoulsFormats` at `9c0da6b0721372b34f36b4be503ec020dca1043a`.
- Legacy HKX: `Meowmaritus/MVDX_Classic` at `e8696492aaf83f0ece7e5a1887f91b4f928bd91d`, under `SoulsFormats/SoulsFormats`.
- ZstdSharp.Port: NuGet version `0.8.1`, restored by the extractor project.

`Legacy.Hkx.csproj` provides a .NET 10 build wrapper for the upstream legacy sources. The legacy assembly name is `SoulsFormats.Modern.dll` for compatibility with the extractor's existing alias; it is the legacy parser despite that filename.

```powershell
dotnet run --project tools/Extract/Extract.csproj -c Release -- "X:/your-game/dvdroot_ps4" artifacts/extracted
dotnet run --project tools/Extract/Extract.csproj -c Release -- "X:/your-game/dvdroot_ps4" artifacts/extracted --npc-only
```

Specify the project file explicitly because this directory also contains the legacy-library project. Extracted data is local game content and is not covered by the application's MIT license. See [the full data setup](../../docs/DATA_SETUP.md).

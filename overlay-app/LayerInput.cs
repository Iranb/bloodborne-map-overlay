namespace BloodborneMap;

// Read-only edge detection, independent of the game-input isolation mode.
internal sealed class LayerInput
{
    private ushort previous;
    private bool baseline = true;
    internal void Reset() => baseline = true;
    internal int Read(ushort buttons, bool active)
    {
        ushort pressed = (ushort)(buttons & ~previous);
        previous = buttons;
        if (!active) { baseline = true; return 0; }
        if (baseline) { baseline = false; return 0; }
        bool up = (pressed & GamepadReader.DPadUp) != 0;
        bool down = (pressed & GamepadReader.DPadDown) != 0;
        return up == down ? 0 : up ? 1 : -1;
    }
}

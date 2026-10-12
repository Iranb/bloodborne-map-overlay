using BloodborneMap;

var input = new LayerInput();
int checks = 0;
void Check(ushort buttons, bool active, int expected)
{
    int actual = input.Read(buttons, active);
    if (actual != expected) throw new Exception($"Expected {expected}, got {actual} for {buttons:x}");
    checks++;
}
Check(0, true, 0);
Check(GamepadReader.DPadUp, true, 1);
Check(GamepadReader.DPadUp, true, 0); // held key
Check(0, true, 0);
Check(GamepadReader.DPadDown, true, -1);
Check(0, true, 0);
Check(GamepadReader.DPadUp | GamepadReader.DPadDown, true, 0);
Check(0, false, 0);
Check(GamepadReader.DPadUp, false, 0); // hidden/unrelated foreground
Check(GamepadReader.DPadUp, true, 0); // show while held
Check(0, true, 0);
Check(GamepadReader.DPadUp, true, 1);
input.Reset(); // reconnect/focus
Check(GamepadReader.DPadDown, true, 0);
Check(0, true, 0);
Check(GamepadReader.DPadDown, true, -1);
Check(GamepadReader.A, true, 0);
Console.WriteLine($"PASS: {checks} controller edge, visibility and reconnect checks");
var pad = new GamepadReader();
Console.WriteLine(pad.TryRead(out var snapshot) ? $"Controller detected: {snapshot.Source}, buttons=0x{snapshot.Buttons:x4}" : "No connected controller detected during this check");

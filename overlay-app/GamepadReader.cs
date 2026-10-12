using System.Runtime.InteropServices;

namespace BloodborneMap;

/// <summary>
/// Read-only controller polling. XInput is preferred so the overlay follows the
/// same virtual controller used by the game; WinMM is a fallback for a physical
/// PlayStation/DirectInput pad when Steam Input changes profile after focus moves.
/// </summary>
internal sealed class GamepadReader
{
    internal const ushort DPadUp = 0x0001;
    internal const ushort DPadDown = 0x0002;
    internal const ushort DPadLeft = 0x0004;
    internal const ushort DPadRight = 0x0008;
    internal const ushort Start = 0x0010;
    internal const ushort Back = 0x0020;
    internal const ushort LeftThumb = 0x0040;
    internal const ushort RightThumb = 0x0080;
    internal const ushort LeftShoulder = 0x0100;
    internal const ushort RightShoulder = 0x0200;
    internal const ushort SpecialToggle = 0x0400;
    internal const ushort TouchpadToggle = 0x0800;
    internal const ushort A = 0x1000;
    internal const ushort B = 0x2000;
    internal const ushort X = 0x4000;
    internal const ushort Y = 0x8000;

    private const uint ErrorSuccess = 0;
    private const uint JoyReturnAll = 0x000000FF;
    private const uint JoyPovCentered = 0x0000FFFF;
    private const int LeftThumbDeadZone = 7849;
    private const int RightThumbDeadZone = 8689;
    private const int TriggerThreshold = 30;
    private int? winMmDeviceIndex;
    private uint? xInputIndex;
    private long nextXInputDiscovery, nextWinMmDiscovery;
    private bool xInputUnavailable;


    public bool TryRead(out GamepadSnapshot snapshot)
    {
        // Poll a connected pad normally. Failed device discovery is throttled,
        // rather than calling four disconnected XInput slots every 50 ms.
        uint first=xInputIndex??0, end=xInputIndex.HasValue?first+1:4;
        if(xInputUnavailable||(!xInputIndex.HasValue&&Environment.TickCount64<nextXInputDiscovery))end=0;
        bool searched=end>0;
        for (uint index = first; index < end; index++)
        {
            try
            {
                if (NativeMethods.XInputGetState(index, out var state) == ErrorSuccess)
                {
                    xInputIndex=index;
                    var buttons = state.Gamepad.Buttons;
                    var source = $"XInput {index + 1}";
                    // DualSense exposes its touchpad click and microphone-mute
                    // button only through the physical DirectInput device. Merge
                    // those two controls while retaining XInput axes/buttons.
                    if (TryReadWinMm(out var physical))
                    {
                        buttons |= (ushort)(physical.Buttons & (SpecialToggle | TouchpadToggle));
                        source += " + Sony HID";
                    }
                    snapshot = new GamepadSnapshot(
                        buttons,
                        NormalizeThumb(state.Gamepad.ThumbLX, LeftThumbDeadZone),
                        NormalizeThumb(state.Gamepad.ThumbLY, LeftThumbDeadZone),
                        NormalizeThumb(state.Gamepad.ThumbRX, RightThumbDeadZone),
                        NormalizeThumb(state.Gamepad.ThumbRY, RightThumbDeadZone),
                        NormalizeTrigger(state.Gamepad.LeftTrigger),
                        NormalizeTrigger(state.Gamepad.RightTrigger),
                        source);
                    return true;
                }
            }
            catch (DllNotFoundException)
            {
                xInputUnavailable=true;break;
            }
            catch (EntryPointNotFoundException)
            {
                xInputUnavailable=true;break;
            }
        }

        if(searched){xInputIndex=null;nextXInputDiscovery=Environment.TickCount64+1000;}
        return TryReadWinMm(out snapshot);
    }

    private bool TryReadWinMm(out GamepadSnapshot snapshot)
    {
        if (winMmDeviceIndex is { } cached && TryReadWinMmDevice(cached, out snapshot))
        {
            return true;
        }

        winMmDeviceIndex = null;
        if(Environment.TickCount64<nextWinMmDiscovery){snapshot=default;return false;}
        nextWinMmDiscovery=Environment.TickCount64+1000;
        var count = Math.Min(NativeMethods.joyGetNumDevs(), 16u);
        for (var index = 0; index < count; index++)
        {
            if (!TryReadWinMmDevice((int)index, out snapshot)) continue;
            winMmDeviceIndex = (int)index;
            return true;
        }

        snapshot = default;
        return false;
    }

    private static bool TryReadWinMmDevice(int index, out GamepadSnapshot snapshot)
    {
        var info = new JoyInfoEx
        {
            Size = (uint)Marshal.SizeOf<JoyInfoEx>(),
            Flags = JoyReturnAll
        };
        if (NativeMethods.joyGetPosEx((uint)index, ref info) != 0)
        {
            snapshot = default;
            return false;
        }

        // Standard PlayStation HID/DirectInput order: Square, Cross, Circle,
        // Triangle, L1, R1, L2, R2, Share, Options, L3, R3.
        ushort buttons = 0;
        MapButton(info.Buttons, 1u << 1, ref buttons, A);
        MapButton(info.Buttons, 1u << 2, ref buttons, B);
        MapButton(info.Buttons, 1u << 0, ref buttons, X);
        MapButton(info.Buttons, 1u << 3, ref buttons, Y);
        MapButton(info.Buttons, 1u << 4, ref buttons, LeftShoulder);
        MapButton(info.Buttons, 1u << 5, ref buttons, RightShoulder);
        MapButton(info.Buttons, 1u << 8, ref buttons, Back);
        MapButton(info.Buttons, 1u << 9, ref buttons, Start);
        MapButton(info.Buttons, 1u << 10, ref buttons, LeftThumb);
        MapButton(info.Buttons, 1u << 11, ref buttons, RightThumb);
        // DualSense / DualSense Edge touchpad click. It controls only the
        // overlay window size and remains distinct from XInput Back/Share.
        MapButton(info.Buttons, 1u << 13, ref buttons, TouchpadToggle);
        // DualSense / DualSense Edge microphone-mute button. Dark Souls II's
        // Xbox-style input has no equivalent, so it is a conflict-free toggle.
        MapButton(info.Buttons, 1u << 14, ref buttons, SpecialToggle);
        MapPov(info.Pov, ref buttons);

        var leftTrigger = Math.Max(NormalizeUnsignedAxis(info.U),
            (info.Buttons & (1u << 6)) != 0 ? 1f : 0f);
        var rightTrigger = Math.Max(NormalizeUnsignedAxis(info.V),
            (info.Buttons & (1u << 7)) != 0 ? 1f : 0f);

        snapshot = new GamepadSnapshot(
            buttons,
            NormalizeWinMmStick(info.X),
            -NormalizeWinMmStick(info.Y),
            NormalizeWinMmStick(info.Z),
            -NormalizeWinMmStick(info.R),
            leftTrigger,
            rightTrigger,
            $"DirectInput {index + 1}");
        return true;
    }

    private static void MapButton(uint source, uint sourceMask, ref ushort target, ushort targetMask)
    {
        if ((source & sourceMask) != 0) target |= targetMask;
    }

    private static void MapPov(uint pov, ref ushort buttons)
    {
        if (pov == JoyPovCentered || pov > 35_999) return;
        if (pov >= 31_500 || pov < 4_500) buttons |= DPadUp;
        if (pov >= 4_500 && pov < 13_500) buttons |= DPadRight;
        if (pov >= 13_500 && pov < 22_500) buttons |= DPadDown;
        if (pov >= 22_500 && pov < 31_500) buttons |= DPadLeft;
    }

    private static float NormalizeThumb(short value, int deadZone)
    {
        var normalized = value < 0 ? value / 32768f : value / 32767f;
        return ApplyDeadZone(normalized, deadZone / 32767f);
    }

    private static float NormalizeWinMmStick(uint value)
    {
        var normalized = Math.Clamp(((float)value - 32767.5f) / 32767.5f, -1f, 1f);
        return ApplyDeadZone(normalized, 0.18f);
    }

    private static float NormalizeTrigger(byte value)
    {
        if (value <= TriggerThreshold) return 0;
        return (value - TriggerThreshold) / (255f - TriggerThreshold);
    }

    private static float NormalizeUnsignedAxis(uint value)
    {
        var normalized = Math.Clamp(value / 65535f, 0f, 1f);
        return normalized < 0.08f ? 0 : normalized;
    }

    private static float ApplyDeadZone(float value, float deadZone)
    {
        var magnitude = Math.Abs(value);
        if (magnitude <= deadZone) return 0;
        return MathF.CopySign((magnitude - deadZone) / (1 - deadZone), value);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputState
    {
        public uint PacketNumber;
        public XInputGamepad Gamepad;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputGamepad
    {
        public ushort Buttons;
        public byte LeftTrigger;
        public byte RightTrigger;
        public short ThumbLX;
        public short ThumbLY;
        public short ThumbRX;
        public short ThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JoyInfoEx
    {
        public uint Size;
        public uint Flags;
        public uint X;
        public uint Y;
        public uint Z;
        public uint R;
        public uint U;
        public uint V;
        public uint Buttons;
        public uint ButtonNumber;
        public uint Pov;
        public uint Reserved1;
        public uint Reserved2;
    }

    private static class NativeMethods
    {
        [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
        public static extern uint XInputGetState(uint userIndex, out XInputState state);

        [DllImport("winmm.dll")]
        public static extern uint joyGetNumDevs();

        [DllImport("winmm.dll")]
        public static extern uint joyGetPosEx(uint joyId, ref JoyInfoEx info);
    }
}

internal readonly record struct GamepadSnapshot(
    ushort Buttons,
    float LeftX,
    float LeftY,
    float RightX,
    float RightY,
    float LeftTrigger,
    float RightTrigger,
    string Source);

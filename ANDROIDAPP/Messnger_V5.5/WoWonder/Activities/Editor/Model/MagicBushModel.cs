using JA.Burhanrashid52.Photoeditor.Shape;

namespace WoWonder.Activities.Editor.Model;

public class MagicBushModel
{
    public int Id { set; get; }
    public int Icon { get; set; }
    public IShapeType Type { get; set; }
    public bool ItemSelected { get; set; }
}
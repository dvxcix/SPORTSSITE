using Android.Graphics;
using JA.Burhanrashid52.Photoeditor;

namespace WoWonder.Activities.Editor.Model
{

    public class TextFontModel
    {
        public int Id { set; get; }
        public string Text { get; set; }
        public Typeface Type { get; set; }
        public TextShadow Shadow { get; set; }
        public bool ItemSelected { get; set; }
    }
}

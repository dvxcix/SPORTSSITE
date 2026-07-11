using Android.Graphics;
using JA.Burhanrashid52.Photoeditor;

namespace WoWonder.Activities.Editor.Model
{
    public class FilterModel
    {
        public int Id { set; get; }
        public Bitmap Image { set; get; }
        public PhotoFilter PhotoFilter { set; get; }
        public bool ItemSelected { set; get; }
    }
}

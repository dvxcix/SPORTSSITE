using Android.Graphics;

namespace WoWonder.Activities.Editor.Model
{
    public class StickersModel
    {
        public int Id { set; get; }
        public Bitmap Image { set; get; }
        public string Content { set; get; }

        public StickersType Type { set; get; }
        public bool ItemSelected { set; get; }
    }

    public enum StickersType
    {
        Sticker,
        Emoji,
        Widget,
    }
}
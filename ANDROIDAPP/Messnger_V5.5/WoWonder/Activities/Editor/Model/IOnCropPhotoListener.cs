using Android.Graphics;

namespace WoWonder.Activities.Editor.Model
{
    public interface IOnCropPhotoListener
    {
        void OnFinishCrop(Bitmap bitmap);
    }
}
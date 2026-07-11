namespace WoWonder.Activities.FaceFilters.Tools
{
    public interface ICameraGrabberListener
    {
        void OnCameraInitialized();
        void OnCameraError(string errorMsg);
    }

}

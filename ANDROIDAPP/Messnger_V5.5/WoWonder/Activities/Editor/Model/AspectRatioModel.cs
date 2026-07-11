namespace WoWonder.Activities.Editor.Model
{
    public class AspectRatioModel
    {
        public int Id;
        public readonly int Width;
        public readonly int Height;
        private readonly string SelectedIem;
        private readonly string UnselectItem;
        public bool ItemSelected;

        public AspectRatioModel(int id, int width, int height, string unselectItem, string selectedIem)
        {
            Id = id;
            Width = width;
            Height = height;
            SelectedIem = selectedIem;
            UnselectItem = unselectItem;
            ItemSelected = false;
        }

        public string GetSelectedIem()
        {
            return SelectedIem;
        }


        public string GetUnselectItem()
        {
            return UnselectItem;
        }


    }
}

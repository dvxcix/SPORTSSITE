using Android.App;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using System;
using System.Collections.ObjectModel;
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;

namespace WoWonder.Activities.FaceFilters.Adapters
{
    public class FaceModel
    {
        public string Image { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }
        public string Url { get; set; }
    }

    public class FaceAdapter : RecyclerView.Adapter
    {
        public event EventHandler<FaceAdapterClickEventArgs> ItemClick;
        public event EventHandler<FaceAdapterClickEventArgs> ItemLongClick;

        private readonly Activity ActivityContext;
        public ObservableCollection<FaceModel> FaceList = new ObservableCollection<FaceModel>();

        public FaceAdapter(Activity context)
        {
            try
            {
                ActivityContext = context;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => FaceList?.Count ?? 0;

        // Create new views (invoked by the layout manager)
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> ItemFaceStyle
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.ItemFaceStyle, parent, false);
                var vh = new FaceAdapterViewHolder(itemView, OnClick, OnLongClick);
                return vh;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        // Replace the contents of a view (invoked by the layout manager)
        public override void OnBindViewHolder(RecyclerView.ViewHolder viewHolder, int position)
        {
            try
            {
                var item = FaceList[position];
                if (item != null)
                {
                    if (viewHolder is FaceAdapterViewHolder holder)
                    {
                        GlideImageLoader.LoadImage(ActivityContext, item.Image, holder.Image, ImageStyle.CircleCrop, ImagePlaceholders.Drawable);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public FaceModel GetItem(int position)
        {
            return FaceList[position];
        }

        public override long GetItemId(int position)
        {
            try
            {
                return position;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return 0;
            }
        }

        public override int GetItemViewType(int position)
        {
            try
            {
                return position;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return 0;
            }
        }

        public void OnClick(FaceAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(FaceAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);
    }

    public class FaceAdapterViewHolder : RecyclerView.ViewHolder
    {
        public ImageView Image { get; private set; }
        public View MainView { get; }

        public FaceAdapterViewHolder(View itemView, Action<FaceAdapterClickEventArgs> clickListener, Action<FaceAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                Image = itemView.FindViewById<ImageView>(Resource.Id.img);

                itemView.Click += (sender, e) => clickListener(new FaceAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new FaceAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class FaceAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
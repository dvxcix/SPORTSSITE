using Android.App;
using Android.Views;
using Android.Widget;
using AndroidX.AppCompat.Widget;
using AndroidX.RecyclerView.Widget;
using Bumptech.Glide;
using DE.Hdodenhof.CircleImageViewLib;
using Java.Util;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Utils;
using WoWonderClient.Classes.Broadcast;
using IList = System.Collections.IList;
using Object = Java.Lang.Object;

namespace WoWonder.Activities.Broadcast.Adapter
{
    public class BroadcastAdapter : RecyclerView.Adapter, ListPreloader.IPreloadModelProvider
    {
        public event EventHandler<BroadcastAdapterClickEventArgs> ItemClick;
        public event EventHandler<BroadcastAdapterClickEventArgs> ItemLongClick;
        private readonly Activity ActivityContext;

        public ObservableCollection<BroadcastDataObject> BroadcastList = new ObservableCollection<BroadcastDataObject>();

        public BroadcastAdapter(Activity context)
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

        // Create new views (invoked by the layout manager)
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> Style_HContactView
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.Style_HContactView, parent, false);
                var holder = new BroadcastAdapterViewHolder(itemView, OnClick, OnLongClick);
                return holder;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return null!;
            }
        }

        // Replace the contents of a view (invoked by the layout manager)
        public override void OnBindViewHolder(RecyclerView.ViewHolder viewHolder, int position)
        {
            try
            {
                if (viewHolder is BroadcastAdapterViewHolder holder)
                {
                    var item = BroadcastList[position];
                    if (item != null)
                    {
                        Initialize(holder, item);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void Initialize(BroadcastAdapterViewHolder holder, BroadcastDataObject item)
        {
            try
            {
                GlideImageLoader.LoadImage(ActivityContext, item.Image, holder.Image, ImageStyle.CircleCrop, ImagePlaceholders.DrawableUser, true);

                holder.Name.Text = Methods.FunString.DecodeString(item.Name);
                holder.About.Text = ActivityContext.GetString(Resource.String.Lbl_BroadcastList) + " - " + item.Users.Count + " " + ActivityContext.GetText(Resource.String.Lbl_Recipients);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => BroadcastList?.Count ?? 0;

        public BroadcastDataObject GetItem(int position)
        {
            return BroadcastList[position];
        }

        public override long GetItemId(int position)
        {
            try
            {
                return position;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return 0;
            }
        }

        public override int GetItemViewType(int position)
        {
            try
            {
                return position;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return 0;
            }
        }

        void OnClick(BroadcastAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        void OnLongClick(BroadcastAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

        public IList GetPreloadItems(int p0)
        {
            try
            {
                var d = new List<string>();
                var item = BroadcastList[p0];
                switch (item)
                {
                    case null:
                        return Collections.SingletonList(p0);
                }

                if (item.Image != "")
                {
                    d.Add(item.Image);
                    return d;
                }

                return d;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return Collections.SingletonList(p0);
            }
        }

        public RequestBuilder GetPreloadRequestBuilder(Object p0)
        {
            return GlideImageLoader.GetPreLoadRequestBuilder(ActivityContext, p0.ToString(), ImageStyle.CircleCrop);
        }
    }

    public class BroadcastAdapterViewHolder : RecyclerView.ViewHolder
    {
        #region Variables Basic

        public View MainView { get; }

        public ImageView Image { get; private set; }
        public TextView Name { get; private set; }
        public TextView About { get; private set; }
        public AppCompatButton Button { get; private set; }
        public CircleImageView ImageLastSeen { get; private set; }

        #endregion 

        public BroadcastAdapterViewHolder(View itemView, Action<BroadcastAdapterClickEventArgs> clickListener, Action<BroadcastAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                //Get values
                Image = MainView.FindViewById<ImageView>(Resource.Id.card_pro_pic);
                Name = MainView.FindViewById<TextView>(Resource.Id.card_name);
                About = MainView.FindViewById<TextView>(Resource.Id.card_dist);
                Button = MainView.FindViewById<AppCompatButton>(Resource.Id.cont);
                ImageLastSeen = (CircleImageView)MainView.FindViewById(Resource.Id.ImageLastseen);

                Button.Visibility = ViewStates.Gone;
                ImageLastSeen.Visibility = ViewStates.Gone;

                itemView.Click += (sender, e) => clickListener(new BroadcastAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new BroadcastAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class BroadcastAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
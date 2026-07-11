using Android.App;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using Bumptech.Glide;
using Bumptech.Glide.Load.Engine;
using Bumptech.Glide.Request;
using Bumptech.Glide.Request.Target;
using Bumptech.Glide.Request.Transition;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;

namespace WoWonder.Activities.Editor.Tools.Sticker
{
    public class StickerAdapter : RecyclerView.Adapter
    {
        private readonly Activity ActivityContext;
        public ObservableCollection<StickersModel> StickerList = new ObservableCollection<StickersModel>();
        private readonly RequestOptions Options;

        public StickerAdapter(Activity context)
        {
            try
            {
                ActivityContext = context;

                StickerList = new ObservableCollection<StickersModel>(StickersUrl.StickerList);

                Options = new RequestOptions()
                    .CenterCrop()
                    .SetPriority(Priority.High)
                    .SetUseAnimationPool(false).SetDiskCacheStrategy(DiskCacheStrategy.All)
                    .Error(Resource.Drawable.ImagePlacholder_circle_grey)
                    .Placeholder(Resource.Drawable.ImagePlacholder_circle_grey);

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => StickerList?.Count ?? 0;

        public event EventHandler<StickerAdapterClickEventArgs> ItemClick;
        public event EventHandler<StickerAdapterClickEventArgs> ItemLongClick;

        // Create new views (invoked by the layout manager)
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                switch (viewType)
                {
                    case (int)StickersType.Sticker:
                        {
                            //Setup your layout here >> item_sticker_style
                            var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_sticker_style, parent, false);
                            var vh = new StickerAdapterViewHolder(itemView, OnClick, OnLongClick);
                            return vh;
                        }
                    case (int)StickersType.Emoji:
                        {
                            //Setup your layout here >> item_emoji_style
                            var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_emoji_style, parent, false);
                            var vh = new EmojiAdapterViewHolder(itemView, OnClick, OnLongClick);
                            return vh;
                        }
                    case (int)StickersType.Widget:
                        {
                            //Setup your layout here >> item_widget_style
                            var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_widget_style, parent, false);
                            var vh = new WidgetAdapterViewHolder(itemView, OnClick, OnLongClick);
                            return vh;
                        }
                    default:
                        return null!;
                }
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
                var item = StickerList[position];
                if (item != null)
                {
                    if (item.Type == StickersType.Sticker)
                    {
                        if (viewHolder is StickerAdapterViewHolder holder)
                        {
                            Glide.With(ActivityContext?.BaseContext)
                                .AsBitmap()
                                .Load(item.Content)
                                .Apply(Options)
                                .Into(new MySimpleTarget(this, holder, position));
                        }
                    }
                    else if (item.Type == StickersType.Emoji)
                    {
                        if (viewHolder is EmojiAdapterViewHolder holder)
                        {
                            holder.IconEmoji.Text = item.Content;
                        }
                    }
                    else if (item.Type == StickersType.Widget)
                    {
                        if (viewHolder is WidgetAdapterViewHolder holder)
                        {
                            holder.ImgWidget.SetImageBitmap(item.Image);
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public StickersModel GetItem(int position)
        {
            return StickerList[position];
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
                var item = StickerList[position];
                if (item != null)
                {
                    return item.Type switch
                    {
                        StickersType.Sticker => (int)StickersType.Sticker,
                        StickersType.Emoji => (int)StickersType.Emoji,
                        StickersType.Widget => (int)StickersType.Widget,
                        _ => (int)StickersType.Sticker,
                    };
                }

                return (int)StickersType.Sticker;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return (int)StickersType.Sticker;
            }
        }

        private class MySimpleTarget : CustomTarget
        {
            private readonly StickerAdapter MAdapter;
            private StickerAdapterViewHolder ViewHolder;
            private readonly int Position;
            public MySimpleTarget(StickerAdapter adapter, StickerAdapterViewHolder viewHolder, int position)
            {
                try
                {
                    MAdapter = adapter;
                    ViewHolder = viewHolder;
                    Position = position;
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }

            public override void OnLoadCleared(Drawable p0) { }

            public override void OnResourceReady(Java.Lang.Object resource, ITransition transition)
            {
                try
                {
                    if (MAdapter.StickerList?.Count > 0)
                    {
                        var url = StickersUrl.StickerList.ElementAt(Position).Content;

                        //var bitmap = Stickers.StickerList.ElementAt(Position).Value;
                        var data = MAdapter.StickerList.FirstOrDefault(pair => pair.Content == url);
                        if (data != null)
                        {
                            if (resource is Bitmap bitmap)
                            {
                                ViewHolder.ImgSticker.SetImageBitmap(bitmap);
                                var index = StickersUrl.StickerList.FirstOrDefault(a => a.Content == url);
                                if (index != null)
                                {
                                    index.Image = bitmap;
                                    data.Image = bitmap;
                                }
                            }
                        }
                    }
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }
        }

        public void OnClick(StickerAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(StickerAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);
    }

    public class StickerAdapterViewHolder : RecyclerView.ViewHolder
    {
        public ImageView ImgSticker { get; private set; }
        public View MainView { get; }

        public StickerAdapterViewHolder(View itemView, Action<StickerAdapterClickEventArgs> clickListener, Action<StickerAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                ImgSticker = itemView.FindViewById<ImageView>(Resource.Id.imgSticker);

                itemView.Click += (sender, e) => clickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class EmojiAdapterViewHolder : RecyclerView.ViewHolder
    {
        public TextView IconEmoji { get; private set; }
        public View MainView { get; }

        public EmojiAdapterViewHolder(View itemView, Action<StickerAdapterClickEventArgs> clickListener, Action<StickerAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                IconEmoji = itemView.FindViewById<TextView>(Resource.Id.iconEmoji);

                itemView.Click += (sender, e) => clickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class WidgetAdapterViewHolder : RecyclerView.ViewHolder
    {
        public ImageView ImgWidget { get; private set; }
        public View MainView { get; }

        public WidgetAdapterViewHolder(View itemView, Action<StickerAdapterClickEventArgs> clickListener, Action<StickerAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                ImgWidget = itemView.FindViewById<ImageView>(Resource.Id.imgWidget);

                itemView.Click += (sender, e) => clickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new StickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class StickerAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
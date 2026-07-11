using Android.App;
using Android.Content.Res;
using Android.Graphics;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using JA.Burhanrashid52.Photoeditor.Shape;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Brush
{
    public class MagicBushAdapter : RecyclerView.Adapter
    {
        private readonly Activity ActivityContext;

        public readonly ObservableCollection<MagicBushModel> MagicBushList = new ObservableCollection<MagicBushModel>();

        public event EventHandler<MagicBushAdapterClickEventArgs> ItemClick;
        public event EventHandler<MagicBushAdapterClickEventArgs> ItemLongClick;

        public MagicBushAdapter(Activity context)
        {
            try
            {
                ActivityContext = context;

                MagicBushList.Add(new MagicBushModel { Id = 0, Icon = Resource.Drawable.ic_brush, Type = IShapeType.Brush.Instance, ItemSelected = true });
                MagicBushList.Add(new MagicBushModel { Id = 1, Icon = Resource.Drawable.ic_arrow_up, Type = new IShapeType.Arrow() });
                MagicBushList.Add(new MagicBushModel { Id = 2, Icon = Resource.Drawable.ic_line, Type = IShapeType.Line.Instance });
                MagicBushList.Add(new MagicBushModel { Id = 3, Icon = Resource.Drawable.ic_circle_oval, Type = IShapeType.Oval.Instance });
                MagicBushList.Add(new MagicBushModel { Id = 4, Icon = Resource.Drawable.ic_rectangle, Type = IShapeType.Rectangle.Instance });
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
                //Setup your layout here >> item_magic_brush
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_magic_brush, parent, false);
                var vh = new MagicBushAdapterViewHolder(itemView, OnClick, OnLongClick);
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
                if (viewHolder is MagicBushAdapterViewHolder holder)
                {
                    var item = MagicBushList[position];
                    if (item != null)
                    {
                        holder.MagicIcon.SetImageResource(item.Icon);
                        if (item.ItemSelected)
                        {
                            holder.MagicIcon.ImageTintList = ColorStateList.ValueOf(Color.ParseColor(AppSettings.MainColor));
                        }
                        else
                        {
                            holder.MagicIcon.ImageTintList = ColorStateList.ValueOf(Color.Black);
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void Click_item(MagicBushModel item)
        {
            try
            {
                var check = MagicBushList.Where(a => a.ItemSelected).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.ItemSelected = false;

                var click = MagicBushList.FirstOrDefault(a => a.Id == item.Id);
                if (click != null) click.ItemSelected = true;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => MagicBushList?.Count ?? 0;

        public MagicBushModel GetItem(int position)
        {
            return MagicBushList[position];
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

        public void OnClick(MagicBushAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(MagicBushAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

    }

    public class MagicBushAdapterViewHolder : RecyclerView.ViewHolder
    {
        #region Variables Basic

        public View MainView { get; }

        public ImageView MagicIcon { get; private set; }

        #endregion

        public MagicBushAdapterViewHolder(View itemView, Action<MagicBushAdapterClickEventArgs> clickListener, Action<MagicBushAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                MagicIcon = itemView.FindViewById<ImageView>(Resource.Id.magicBrush);

                itemView.Click += (sender, e) => clickListener(new MagicBushAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new MagicBushAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class MagicBushAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}

using Android.App;
using Android.Graphics;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Adapters
{
    public class EditingToolsAdapter : RecyclerView.Adapter
    {
        public readonly ObservableCollection<ToolModel> ToolList = new ObservableCollection<ToolModel>();

        public event EventHandler<EditingToolsAdapterClickEventArgs> ItemClick;
        public event EventHandler<EditingToolsAdapterClickEventArgs> ItemLongClick;

        public EditingToolsAdapter(Activity context)
        {
            try
            {
                var activityContext = context;

                var brush = activityContext.GetText(Resource.String.Lbl_brush);
                var text = activityContext.GetText(Resource.String.Lbl_text);
                var filter = activityContext.GetText(Resource.String.Lbl_Filter);
                var sticker = activityContext.GetText(Resource.String.Lbl_Sticker);
                var image = activityContext.GetText(Resource.String.image);
                var crop = activityContext.GetText(Resource.String.Lbl_Crop);

                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_brush, Name = brush, Type = ToolType.Brush, Color = "#212121" });
                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_text, Name = text, Type = ToolType.Text, Color = "#212121" });
                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_filter, Name = filter, Type = ToolType.Filter, Color = "#212121" });
                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_sticker, Name = sticker, Type = ToolType.Sticker, Color = "#212121" });
                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_image, Name = image, Type = ToolType.Image, Color = "#212121" });
                ToolList.Add(new ToolModel { Icon = Resource.Drawable.ic_crop, Name = crop, Type = ToolType.CropImage, Color = "#212121" });
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
                //Setup your layout here >> item_editing_tools
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_editing_tools, parent, false);
                var vh = new EditingToolsAdapterViewHolder(itemView, OnClick, OnLongClick);
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
                if (viewHolder is EditingToolsAdapterViewHolder holder)
                {
                    var item = ToolList[position];
                    if (item != null)
                    {
                        holder.TxtTool.Text = item.Name;
                        holder.TxtTool.SetTextColor(Color.ParseColor(item.Color));

                        holder.ImgToolIcon.SetImageResource(item.Icon);
                        holder.ImgToolIcon.SetColorFilter(Color.ParseColor(item.Color));
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void Click_item(ToolModel item)
        {
            try
            {
                var check = ToolList.Where(a => a.Color == AppSettings.MainColor).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.Color = "#212121";

                var click = ToolList.FirstOrDefault(a => a.Name == item.Name);
                if (click != null) click.Color = AppSettings.MainColor;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => ToolList?.Count ?? 0;


        public ToolModel GetItem(int position)
        {
            return ToolList[position];
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

        public void OnClick(EditingToolsAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(EditingToolsAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

    }

    public class EditingToolsAdapterViewHolder : RecyclerView.ViewHolder
    {
        #region Variables Basic

        public View MainView { get; }

        public ImageView ImgToolIcon { get; private set; }
        public TextView TxtTool { get; private set; }

        #endregion
        public EditingToolsAdapterViewHolder(View itemView, Action<EditingToolsAdapterClickEventArgs> clickListener, Action<EditingToolsAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                ImgToolIcon = itemView.FindViewById<ImageView>(Resource.Id.imgToolIcon);
                TxtTool = itemView.FindViewById<TextView>(Resource.Id.txtTool);

                itemView.Click += (sender, e) => clickListener(new EditingToolsAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new EditingToolsAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class EditingToolsAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
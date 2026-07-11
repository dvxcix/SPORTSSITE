using Android.App;
using Android.Graphics;
using Android.Views;
using Android.Widget;
using AndroidX.Core.View;
using AndroidX.RecyclerView.Widget;
using JA.Burhanrashid52.Photoeditor;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Text
{
    internal class FontShadowAdapter : RecyclerView.Adapter
    {
        public event EventHandler<FontShadowAdapterClickEventArgs> ItemClick;
        public event EventHandler<FontShadowAdapterClickEventArgs> ItemLongClick;

        private readonly Activity ActivityContext;
        public readonly ObservableCollection<TextFontModel> TextShadowList = new ObservableCollection<TextFontModel>();

        public FontShadowAdapter(Activity context)
        {
            try
            {
                ActivityContext = context;
                GetTextShadow();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => TextShadowList?.Count ?? 0;

        // Create new views (invoked by the layout manager) 
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> item_font_style
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_font_style, parent, false);
                var vh = new FontShadowAdapterViewHolder(itemView, OnClick, OnLongClick);
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
                if (viewHolder is FontShadowAdapterViewHolder holder)
                {
                    var item = TextShadowList[position];
                    if (item != null)
                    {
                        holder.TxtFontType.Text = item.Text;

                        if (item.ItemSelected)
                        {
                            holder.TxtFontType.SetBackgroundResource(Resource.Drawable.round_button_pressed);
                            holder.TxtFontType.SetTextColor(Color.White);
                        }
                        else
                        {
                            holder.TxtFontType.SetBackgroundResource(Resource.Drawable.round_button_gray);
                            holder.TxtFontType.SetTextColor(Color.Black);
                        }

                        holder.TxtFontType.SetShadowLayer(item.Shadow.Radius, item.Shadow.Dx, item.Shadow.Dy, new Color(item.Shadow.Color));
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void Click_item(TextFontModel item)
        {
            try
            {
                var check = TextShadowList.Where(a => a.ItemSelected).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.ItemSelected = false;

                var click = TextShadowList.FirstOrDefault(a => a.Id == item.Id);
                if (click != null) click.ItemSelected = true;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public TextFontModel GetItem(int position)
        {
            return TextShadowList[position];
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

        public void OnClick(FontShadowAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(FontShadowAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

        private void GetTextShadow()
        {
            try
            {
                TextShadowList.Add(new TextFontModel() { Id = 0, Text = "Text Shadow", ItemSelected = true, Shadow = new TextShadow(0, 0, 0, -16711681) });
                TextShadowList.Add(new TextFontModel() { Id = 1, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, Color.ParseColor("#FF1493")) });
                TextShadowList.Add(new TextFontModel() { Id = 2, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, -65281) });
                TextShadowList.Add(new TextFontModel() { Id = 3, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, Color.ParseColor("#24ffff")) });
                TextShadowList.Add(new TextFontModel() { Id = 4, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, InputDeviceCompat.SourceAny) });
                TextShadowList.Add(new TextFontModel() { Id = 5, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, -1) });
                TextShadowList.Add(new TextFontModel() { Id = 6, Text = "Text Shadow", Shadow = new TextShadow(8, 4, 4, -7829368) });
                TextShadowList.Add(new TextFontModel() { Id = 7, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, Color.ParseColor("#FF1493")) });
                TextShadowList.Add(new TextFontModel() { Id = 8, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, -65281) });
                TextShadowList.Add(new TextFontModel() { Id = 9, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, Color.ParseColor("#24ffff")) });
                TextShadowList.Add(new TextFontModel() { Id = 10, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, InputDeviceCompat.SourceAny) });
                TextShadowList.Add(new TextFontModel() { Id = 11, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, -1) });
                TextShadowList.Add(new TextFontModel() { Id = 12, Text = "Text Shadow", Shadow = new TextShadow(8, -4, -4, Color.ParseColor("#696969")) });
                TextShadowList.Add(new TextFontModel() { Id = 13, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, Color.ParseColor("#FF1493")) });
                TextShadowList.Add(new TextFontModel() { Id = 14, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, -65281) });
                TextShadowList.Add(new TextFontModel() { Id = 15, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, Color.ParseColor("#24ffff")) });
                TextShadowList.Add(new TextFontModel() { Id = 16, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, InputDeviceCompat.SourceAny) });
                TextShadowList.Add(new TextFontModel() { Id = 17, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, -1) });
                TextShadowList.Add(new TextFontModel() { Id = 18, Text = "Text Shadow", Shadow = new TextShadow(8, -4, 4, Color.ParseColor("#696969")) });
                TextShadowList.Add(new TextFontModel() { Id = 19, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, Color.ParseColor("#FF1493")) });
                TextShadowList.Add(new TextFontModel() { Id = 20, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, -65281) });
                TextShadowList.Add(new TextFontModel() { Id = 21, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, Color.ParseColor("#24ffff")) });
                TextShadowList.Add(new TextFontModel() { Id = 22, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, InputDeviceCompat.SourceAny) });
                TextShadowList.Add(new TextFontModel() { Id = 23, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, -1) });
                TextShadowList.Add(new TextFontModel() { Id = 24, Text = "Text Shadow", Shadow = new TextShadow(8, 4, -4, Color.ParseColor("#696969")) });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class FontShadowAdapterViewHolder : RecyclerView.ViewHolder
    {
        public TextView TxtFontType { get; private set; }
        public View MainView { get; }
        public FontShadowAdapterViewHolder(View itemView, Action<FontShadowAdapterClickEventArgs> clickListener, Action<FontShadowAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                TxtFontType = itemView.FindViewById<TextView>(Resource.Id.txt_Font);

                itemView.Click += (sender, e) => clickListener(new FontShadowAdapterClickEventArgs
                { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new FontShadowAdapterClickEventArgs
                { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class FontShadowAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
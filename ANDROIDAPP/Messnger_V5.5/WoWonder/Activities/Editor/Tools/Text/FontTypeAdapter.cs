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

namespace WoWonder.Activities.Editor.Tools.Text
{
    public class FontTypeAdapter : RecyclerView.Adapter
    {
        public event EventHandler<FontTypeAdapterClickEventArgs> ItemClick;
        public event EventHandler<FontTypeAdapterClickEventArgs> ItemLongClick;

        private readonly Activity ActivityContext;
        public readonly ObservableCollection<TextFontModel> FontTypeList = new ObservableCollection<TextFontModel>();


        public FontTypeAdapter(Activity context)
        {
            try
            {
                ActivityContext = context;
                GetFontTypeFace();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => FontTypeList?.Count ?? 0;

        // Create new views (invoked by the layout manager) 
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> item_font_style
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_font_style, parent, false);
                var vh = new FontTypeAdapterViewHolder(itemView, OnClick, OnLongClick);
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
                if (viewHolder is FontTypeAdapterViewHolder holder)
                {
                    var item = FontTypeList[position];
                    if (item != null)
                    {
                        holder.TxtFontType.Text = item.Text;
                        holder.TxtFontType.SetTypeface(item.Type, TypefaceStyle.Normal);

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
                var check = FontTypeList.Where(a => a.ItemSelected).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.ItemSelected = false;

                var click = FontTypeList.FirstOrDefault(a => a.Id == item.Id);
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
            return FontTypeList[position];
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

        public void OnClick(FontTypeAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(FontTypeAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

        private void GetFontTypeFace()
        {
            try
            {
                var fontTxt0 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/DynaPuff.ttf");
                var fontTxt1 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Eater.ttf");
                var fontTxt2 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/HennyPenny.ttf");
                var fontTxt3 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Iceberg.ttf");
                var fontTxt4 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/MonsieurLaDoulaise.ttf");
                var fontTxt5 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/PlaywriteVN.ttf");
                var fontTxt6 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Poppins.ttf");
                var fontTxt7 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/RubikDirt.ttf");
                var fontTxt8 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Urbanist.ttf");
                var fontTxt9 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Almarai.ttf");
                var fontTxt10 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Cairo.ttf");
                var fontTxt11 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Fustat.ttf");
                var fontTxt12 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/NotoSansArabic.ttf");
                var fontTxt13 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Rakkas.ttf");
                var fontTxt14 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/BryndanWrite.ttf");
                var fontTxt15 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Hacen.ttf");
                var fontTxt16 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Harmattan.ttf");
                var fontTxt17 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/Norican.ttf");
                var fontTxt18 = Typeface.CreateFromAsset(ActivityContext.Assets, "fonts/OswaldHeavy.ttf");

                FontTypeList.Add(new TextFontModel() { Id = 0, Text = "DynaPuff", Type = fontTxt0 });
                FontTypeList.Add(new TextFontModel() { Id = 1, Text = "Eater", Type = fontTxt1 });
                FontTypeList.Add(new TextFontModel() { Id = 2, Text = "Henny Penny", Type = fontTxt2 });
                FontTypeList.Add(new TextFontModel() { Id = 3, Text = "Iceberg", Type = fontTxt3 });
                FontTypeList.Add(new TextFontModel() { Id = 4, Text = "Monsieur La Doulaise", Type = fontTxt4 });
                FontTypeList.Add(new TextFontModel() { Id = 5, Text = "PlaywriteVN", Type = fontTxt5 });
                FontTypeList.Add(new TextFontModel() { Id = 6, Text = "Poppins", Type = fontTxt6 });
                FontTypeList.Add(new TextFontModel() { Id = 7, Text = "Rubik Dirt", Type = fontTxt7 });
                FontTypeList.Add(new TextFontModel() { Id = 8, Text = "Urbanist", Type = fontTxt8 });
                FontTypeList.Add(new TextFontModel() { Id = 9, Text = "Almarai", Type = fontTxt9 });
                FontTypeList.Add(new TextFontModel() { Id = 10, Text = "Cairo", Type = fontTxt10 });
                FontTypeList.Add(new TextFontModel() { Id = 11, Text = "Fustat", Type = fontTxt11 });
                FontTypeList.Add(new TextFontModel() { Id = 12, Text = "Noto Sans", Type = fontTxt12 });
                FontTypeList.Add(new TextFontModel() { Id = 13, Text = "Rakkas", Type = fontTxt13 });
                FontTypeList.Add(new TextFontModel() { Id = 14, Text = "Bryndan Write", Type = fontTxt14 });
                FontTypeList.Add(new TextFontModel() { Id = 15, Text = "Hacen", Type = fontTxt15 });
                FontTypeList.Add(new TextFontModel() { Id = 16, Text = "Harmattan", Type = fontTxt16 });
                FontTypeList.Add(new TextFontModel() { Id = 17, Text = "Norican", Type = fontTxt17 });
                FontTypeList.Add(new TextFontModel() { Id = 18, Text = "Oswald Heavy", Type = fontTxt18 });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class FontTypeAdapterViewHolder : RecyclerView.ViewHolder
    {
        public TextView TxtFontType { get; private set; }
        public View MainView { get; }
        public FontTypeAdapterViewHolder(View itemView, Action<FontTypeAdapterClickEventArgs> clickListener, Action<FontTypeAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                TxtFontType = itemView.FindViewById<TextView>(Resource.Id.txt_Font);

                itemView.Click += (sender, e) => clickListener(new FontTypeAdapterClickEventArgs
                { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new FontTypeAdapterClickEventArgs
                { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class FontTypeAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
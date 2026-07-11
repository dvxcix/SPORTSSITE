using Android.App;
using Android.Graphics;
using Android.Views;
using AndroidX.RecyclerView.Widget;
using DE.Hdodenhof.CircleImageViewLib;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Adapters
{
    public class ColorPickerAdapter : RecyclerView.Adapter
    {
        private readonly Activity ActivityContext;

        public event EventHandler<ColorPickerAdapterClickEventArgs> ItemClick;
        public event EventHandler<ColorPickerAdapterClickEventArgs> ItemLongClick;

        public readonly ObservableCollection<ColorPicker> ColorList = new ObservableCollection<ColorPicker>();

        /// <summary>
        /// </summary>
        /// <param name="context"></param>
        /// <param name="colorType">ColorNormal,ColorGradient,ColorNormalAndGradient</param>
        public ColorPickerAdapter(Activity context, ColorType colorType)
        {
            try
            {
                ActivityContext = context;
                ColorList = GetDefaultColors(colorType);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => ColorList?.Count ?? 0;

        // Create new views (invoked by the layout manager)
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> view_color_picker
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_color_picker, parent, false);
                var vh = new ColorPickerAdapterViewHolder(itemView, OnClick, OnLongClick);
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
                if (viewHolder is ColorPickerAdapterViewHolder holder)
                {
                    var item = ColorList[position];
                    if (item != null)
                    {
                        var width = 150;
                        var height = 150;
                        if (!string.IsNullOrEmpty(item.ColorSecond))
                        {
                            int[] color = { Color.ParseColor(item.ColorFirst), Color.ParseColor(item.ColorSecond) };

                            var (gradient, bitmap) = ColorUtils.GetGradientDrawable(color, width, height, false, true);
                            holder.ColorPickerView.SetImageBitmap(bitmap);
                        }
                        else
                        {
                            var bitmap = BitmapUtils.LoadBitmapFromColor(Color.ParseColor(item.ColorFirst), width, height);
                            holder.ColorPickerView.SetImageBitmap(bitmap);
                        }

                        if (item.SelectedColor)
                        {
                            holder.ColorPickerView.BorderWidth = PixelUtil.DpToPx(ActivityContext, 2);
                            holder.ColorPickerView.BorderColor = Color.ParseColor(AppSettings.MainColor);
                        }
                        else
                        {
                            if (item.ColorFirst == "#FFFFFF")
                            {
                                holder.ColorPickerView.BorderWidth = PixelUtil.DpToPx(ActivityContext, 2);
                                holder.ColorPickerView.BorderColor = Color.Black;
                            }
                            else
                            {
                                holder.ColorPickerView.BorderWidth = 0;
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

        public void Click_item(ColorPicker item)
        {
            try
            {
                var check = ColorList.Where(a => a.SelectedColor).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.SelectedColor = false;

                var click = ColorList.FirstOrDefault(a => a.Id == item.Id);
                if (click != null) click.SelectedColor = true;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public ObservableCollection<ColorPicker> GetDefaultColors(ColorType colorType)
        {
            try
            {
                var colorPickerColors = new ObservableCollection<ColorPicker>();

                if (colorType == ColorType.ColorNormal)
                {
                    colorPickerColors.Add(new ColorPicker { Id = 1, ColorFirst = "#FFFFFF", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 2, ColorFirst = "#000000", ColorSecond = "", SelectedColor = true });
                    colorPickerColors.Add(new ColorPicker { Id = 3, ColorFirst = "#f44336", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 4, ColorFirst = "#E91E63", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 5, ColorFirst = "#EC407A", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 6, ColorFirst = "#9C27B0", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 7, ColorFirst = "#3F51B5", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 8, ColorFirst = "#2196F3", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 9, ColorFirst = "#03A9F4", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 10, ColorFirst = "#00BFA5", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 11, ColorFirst = "#00BCD4", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 12, ColorFirst = "#009688", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 13, ColorFirst = "#4CAF50", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 14, ColorFirst = "#8BC34A", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 15, ColorFirst = "#CDDC39", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 16, ColorFirst = "#FFEB3B", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 17, ColorFirst = "#FFC107", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 18, ColorFirst = "#FF9800", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 19, ColorFirst = "#FF5722", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 20, ColorFirst = "#795548", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 21, ColorFirst = "#9E9E9E", ColorSecond = "", });
                    colorPickerColors.Add(new ColorPicker { Id = 22, ColorFirst = "#607D8B", ColorSecond = "", });
                }
                else if (colorType == ColorType.ColorGradient)
                {
                    colorPickerColors.Add(new ColorPicker { Id = 23, ColorFirst = "#fc8f35", ColorSecond = "#de2362", SelectedColor = true });
                    colorPickerColors.Add(new ColorPicker { Id = 24, ColorFirst = "#78c2eb", ColorSecond = "#3c9fc7", });
                    colorPickerColors.Add(new ColorPicker { Id = 25, ColorFirst = "#2393cf", ColorSecond = "#b02071", });
                    colorPickerColors.Add(new ColorPicker { Id = 26, ColorFirst = "#3dccd1", ColorSecond = "#dec53a", });
                    colorPickerColors.Add(new ColorPicker { Id = 27, ColorFirst = "#ed6fb7", ColorSecond = "#e02d7e", });
                    colorPickerColors.Add(new ColorPicker { Id = 28, ColorFirst = "#55bec2", ColorSecond = "#d6866f", });
                    colorPickerColors.Add(new ColorPicker { Id = 29, ColorFirst = "#09479e", ColorSecond = "#28aac7", });
                    colorPickerColors.Add(new ColorPicker { Id = 30, ColorFirst = "#db1f61", ColorSecond = "#fa5732", });
                    colorPickerColors.Add(new ColorPicker { Id = 31, ColorFirst = "#83a4e6", ColorSecond = "#e82cb0", });
                    colorPickerColors.Add(new ColorPicker { Id = 32, ColorFirst = "#6674b3", ColorSecond = "#e86033", });
                    colorPickerColors.Add(new ColorPicker { Id = 33, ColorFirst = "#06c749", ColorSecond = "#431e87", });
                    colorPickerColors.Add(new ColorPicker { Id = 34, ColorFirst = "#ff6b54", ColorSecond = "#fa1007", });
                    colorPickerColors.Add(new ColorPicker { Id = 35, ColorFirst = "#030303", ColorSecond = "#5a5c5b", });
                    colorPickerColors.Add(new ColorPicker { Id = 36, ColorFirst = "#2a3238", ColorSecond = "#7c848a", });
                    colorPickerColors.Add(new ColorPicker { Id = 37, ColorFirst = "#c2c7cc", ColorSecond = "#9ea4b0", });
                    colorPickerColors.Add(new ColorPicker { Id = 38, ColorFirst = "#ef5350", ColorSecond = "#b71c1c", });
                    colorPickerColors.Add(new ColorPicker { Id = 39, ColorFirst = "#EC407A", ColorSecond = "#880E4F", });
                    colorPickerColors.Add(new ColorPicker { Id = 40, ColorFirst = "#AB47BC", ColorSecond = "#4A148C", });
                    colorPickerColors.Add(new ColorPicker { Id = 41, ColorFirst = "#5C6BC0", ColorSecond = "#1A237E", });
                    colorPickerColors.Add(new ColorPicker { Id = 42, ColorFirst = "#29B6F6", ColorSecond = "#01579B", });
                    colorPickerColors.Add(new ColorPicker { Id = 43, ColorFirst = "#26A69A", ColorSecond = "#004D40", });
                    colorPickerColors.Add(new ColorPicker { Id = 44, ColorFirst = "#9CCC65", ColorSecond = "#33691E", });
                    colorPickerColors.Add(new ColorPicker { Id = 45, ColorFirst = "#FFEE58", ColorSecond = "#F57F17", });
                    colorPickerColors.Add(new ColorPicker { Id = 46, ColorFirst = "#FF7043", ColorSecond = "#BF360C", });
                    colorPickerColors.Add(new ColorPicker { Id = 47, ColorFirst = "#BDBDBD", ColorSecond = "#424242", });
                    colorPickerColors.Add(new ColorPicker { Id = 48, ColorFirst = "#78909C", ColorSecond = "#263238", });
                    colorPickerColors.Add(new ColorPicker { Id = 49, ColorFirst = "#6ec052", ColorSecond = "#28c4f3", });
                    colorPickerColors.Add(new ColorPicker { Id = 50, ColorFirst = "#fcca5b", ColorSecond = "#ed4955", });
                    colorPickerColors.Add(new ColorPicker { Id = 51, ColorFirst = "#3033c6", ColorSecond = "#fb0049", });
                }

                return colorPickerColors;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public ColorPicker GetItem(int position)
        {
            return ColorList[position];
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

        public void OnClick(ColorPickerAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(ColorPickerAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);

    }

    public class ColorPickerAdapterViewHolder : RecyclerView.ViewHolder
    {
        #region Variables Basic

        public View MainView { get; }
        public CircleImageView ColorPickerView { get; }

        #endregion

        public ColorPickerAdapterViewHolder(View itemView, Action<ColorPickerAdapterClickEventArgs> clickListener, Action<ColorPickerAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                ColorPickerView = itemView.FindViewById<CircleImageView>(Resource.Id.color);

                itemView.Click += (sender, e) => clickListener(new ColorPickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new ColorPickerAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class ColorPickerAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
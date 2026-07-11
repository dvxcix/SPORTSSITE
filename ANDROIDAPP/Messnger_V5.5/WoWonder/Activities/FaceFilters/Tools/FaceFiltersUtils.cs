using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.FaceFilters.Adapters;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.FaceFilters.Tools
{
    /// <summary>
    /// You can download the files of filters from here: https://mega.nz/file/r7ZzzJBC#XTtZDBwnDIrHvrbeDglYCot3yrcGsfkszd2mq0yDY3Q
    /// Or you can find more filters here: https://developer.deepar.ai/downloads
    /// </summary>
    public static class FaceFiltersUtils
    {
        public static ObservableCollection<FaceModel> FaceFiltersList = new ObservableCollection<FaceModel>()
        {
            //========== Masks ==========

            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/022/288/319/non_2x/cancel-3d-icon-free-png.png",
                Name = "none", Url = "", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/047/606/497/non_2x/designer-sunglasses-isolated-on-transparent-background-free-png.png",
                Name = "aviators", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481431/aviators_hr4rly", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/053/343/527/non_2x/unique-ceramic-smile-decoration-for-home-decor-png.png",
                Name = "bigmouth", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481429/bigmouth_hkiuch", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/043/345/649/non_2x/dalmatian-puppy-sitting-patiently-illustration-on-transparent-background-free-png.png",
                Name = "dalmatian", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481431/dalmatian_uyaq8q", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/032/325/324/non_2x/red-roses-bouquet-of-garden-flowers-floral-arrangement-isolated-on-transparent-background-file-cut-out-ai-generated-png.png",
                Name = "flowers", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481443/flowers_f7ryu6",
                Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/008/851/566/non_2x/cute-koala-3d-illustration-png.png",
                Name = "koala", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481437/koala_tmlpvk", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/039/213/315/non_2x/ai-generated-lion-on-transparent-background-ai-generated-png.png",
                Name = "lion", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481436/lion_gsyvps", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/053/647/278/non_2x/expressive-image-of-a-teenage-boy-conveying-disgust-and-displeasure-perfect-for-social-media-and-youth-centric-content-png.png",
                Name = "smallface", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481438/smallface_yttccn", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/044/570/898/non_2x/close-up-of-a-hand-holding-a-lit-cigarette-against-a-transparent-background-png.png",
                Name = "teddycigar", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481442/teddycigar_exyldu", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/052/654/167/non_2x/young-man-in-gray-hoodie-thinking-deeply-indoors-png.png",
                Name = "kanye", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481434/kanye_es58tb", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/051/959/791/non_2x/abstract-3d-rendering-of-a-woman-s-facial-expressions-capturing-various-emotions-and-perspectives-in-a-modern-artistic-style-png.png",
                Name = "tripleface", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481439/tripleface_mjvqzu", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/013/149/631/non_2x/watercolor-elements-women-s-travel-blindfold-png.png",
                Name = "sleepingmask", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481438/sleepingmask_lrpvvq", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/053/647/327/non_2x/a-playful-teenage-girl-rolling-her-eyes-in-a-fun-and-expressive-way-perfect-for-conveying-youthful-attitude-in-social-media-or-marketing-campaigns-png.png",
                Name = "fatify", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481431/fatify_y1etts", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/021/595/653/non_2x/woman-with-masking-her-face-with-mud-in-beauty-spa-illustration-painted-with-watercolor-skin-care-beauty-treatment-png.png",
                Name = "mudmask", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481436/mudmask_okwzbn", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/024/476/615/non_2x/watercolor-funny-pug-dog-wearing-sunglasses-ai-generated-png.png",
                Name = "pug", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481438/pug_odzmnd", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/050/280/917/non_2x/3d-style-illustration-of-asia-young-man-in-office-worker-uniform-long-hair-he-is-stressed-isolated-on-transparent-background-png.png",
                Name = "slash", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481442/slash_ifncer",
                Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/053/647/262/non_2x/a-lighthearted-and-humorous-portrait-of-a-teenage-boy-grimacing-with-a-funny-face-perfect-for-social-media-and-youth-related-content-creation-png.png",
                Name = "twistedface", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481439/twistedface_s6lk5c", Type = "mask"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/044/811/950/non_2x/grumpy-faced-animal-grumpy-faced-animal-clipart-perfect-for-crafting-card-making-and-more-this-adorable-collection-features-a-variety-of-animals-sporting-hilariously-grumpy-expressions-png.png",
                Name = "grumpycat", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481433/grumpycat_v7lamn", Type = "mask"
            },

            //========== Effects ==========

            // new FaceModel() { Image = "https://static.vecteezy.com/system/resources/previews/019/906/467/non_2x/fire-graphic-clipart-design-free-png.png", Name = "fire", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481446/fire_vtwj9i", Type = "mask" },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/024/728/931/non_2x/3d-illustration-of-a-cloud-with-rain-png.png",
                Name = "rain", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481436/rain_psh5kn", Type = "face"
            },
            // new FaceModel() { Image = "https://static.vecteezy.com/system/resources/previews/018/842/695/non_2x/red-heart-shape-icon-like-or-love-symbol-for-valentine-s-day-3d-render-illustration-free-png.png", Name = "heart", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481442/slash_ifncer", Type = "mask" },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/053/715/291/non_2x/a-mesmerizing-digital-illustration-of-a-swirling-vortex-in-shades-of-blue-and-white-depicting-movement-and-energy-in-an-abstract-design-png.png",
                Name = "blizzard", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481430/blizzard_ulm4wu", Type = "face"
            },

            //========== Filters ==========

            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/047/246/581/non_2x/film-roll-3d-illustration-png.png",
                Name = "filmcolorperfection", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481431/filmcolorperfection_s5vhul", Type = "background"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/044/450/773/non_2x/retro-television-with-transparent-background-png.png",
                Name = "tv80", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481439/tv80_ohjshi", Type = "background"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/024/831/271/non_2x/colorful-comic-radial-speed-lines-png.png",
                Name = "drawingmanga", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481431/drawingmanga_o2gkyk", Type = "background"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/050/478/778/non_2x/brown-watercolor-texture-on-white-cut-out-stock-png.png",
                Name = "sepia", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481437/sepia_ggvuow", Type = "background"
            },
            new FaceModel()
            {
                Image = "https://static.vecteezy.com/system/resources/previews/048/220/297/non_2x/yamamoto-bleach-free-png.png",
                Name = "bleachbypass", Url = "https://res.cloudinary.com/dyvrnfxhp/raw/upload/v1740481428/bleachbypass_m3ogfk", Type = "background"
            },
        };

        public static async Task<string> GetFilterPath(string filterName, string filterUrl)
        {
            try
            {
                if (filterName.Equals("none"))
                {
                    return null;
                }

                var filterPath = await WoWonderTools.SaveFileAsync(Methods.Path.FolderDiskFile, filterUrl.Split('/').Last(), filterUrl, "filter");
                return filterPath;

                // return "file:///android_asset/Filters/" + filterName;
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return null;
            }
        }

    }
}

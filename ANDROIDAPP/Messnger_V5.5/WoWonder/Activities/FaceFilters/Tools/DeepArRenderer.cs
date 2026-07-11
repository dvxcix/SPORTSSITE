using AI.Deepar.AR;
using Android.App;
using Android.Graphics;
using Android.Opengl;
using Android.Views;
using IO.Agora.Rtc2;
using IO.Agora.Rtc2.Video;
using Java.Nio;
using Javax.Microedition.Khronos.Egl;
using Javax.Microedition.Khronos.Opengles;
using System;
using WoWonder.Helpers.Utils;
using EGLConfig = Javax.Microedition.Khronos.Egl.EGLConfig;
using Object = Java.Lang.Object;

namespace WoWonder.Activities.FaceFilters.Tools
{
    public class DeepArRenderer : Object, GLSurfaceView.IRenderer
    {
        private readonly string VertexShaderCode = "attribute vec4 vPosition;" + "attribute vec2 vUv;" + "varying vec2 uv; " + "void main() {" + "gl_Position = vPosition;" + "uv = vUv;" + "}";

        private readonly string FragmentShaderCode = "#extension GL_OES_EGL_image_external : require\n" + "precision mediump float;" + "varying vec2 uv; " + "uniform samplerExternalOES sampler;" + "void main() {" + "  gl_FragColor = texture2D(sampler, uv); " + "}";

        private static float[] SquareCoords = new float[] { -1.0f, 1.0f, 0.0f, -1.0f, -1.0f, 0.0f, 1.0f, -1.0f, 0.0f, 1.0f, 1.0f, 0.0f };

        private static float[] Uv = new float[] { 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 0.0f };

        private readonly short[] DrawOrder = new short[] { 0, 1, 2, 0, 2, 3 };

        private FloatBuffer VertexBuffer;
        private FloatBuffer Uvbuffer;
        private ShortBuffer DrawListBuffer;
        private int Program;
        private int Texture;
        private SurfaceTexture SurfaceTexture;
        private Surface Surface;

        private readonly Activity Context;
        private DeepAR DeepAr;
        private RtcEngine RtcEngine;
        private bool UpdateTexImage;

        private bool CallInProgress = false;

        private Javax.Microedition.Khronos.Egl.EGLContext MEglCurrentContext;

        private int TextureWidth;
        private int TextureHeight;

        private float[] Matrix = new float[16];

        public DeepArRenderer(DeepAR deepAr, RtcEngine rtcEngine, Activity context)
        {
            UpdateTexImage = false;
            DeepAr = deepAr;
            RtcEngine = rtcEngine;
            Context = context;
        }

        private int LoadShader(int type, string shaderCode)
        {
            int shader = GLES20.GlCreateShader(type);
            GLES20.GlShaderSource(shader, shaderCode);
            GLES20.GlCompileShader(shader);
            return shader;
        }

        public void OnDrawFrame(IGL10 gl)
        {
            try
            {
                GLES20.GlFinish();
                GLES20.GlClear(GLES20.GlColorBufferBit | GLES20.GlDepthBufferBit);

                if (UpdateTexImage)
                {
                    UpdateTexImage = false;
                    lock (this)
                    {
                        SurfaceTexture.UpdateTexImage();
                    }
                }

                SurfaceTexture.GetTransformMatrix(Matrix);

                GLES20.GlUseProgram(Program);
                int positionHandle = GLES20.GlGetAttribLocation(Program, "vPosition");
                GLES20.GlEnableVertexAttribArray(positionHandle);
                GLES20.GlVertexAttribPointer(positionHandle, 3, GLES20.GlFloat, false, 12, VertexBuffer);

                int uvHandle = GLES20.GlGetAttribLocation(Program, "vUv");
                GLES20.GlEnableVertexAttribArray(uvHandle);
                GLES20.GlVertexAttribPointer(uvHandle, 2, GLES20.GlFloat, false, 8, Uvbuffer);

                int sampler = GLES20.GlGetUniformLocation(Program, "sampler");
                GLES20.GlUniform1i(sampler, 0);

                GLES20.GlActiveTexture(GLES20.GlTexture0);
                GLES20.GlBindTexture(GLES11Ext.GlTextureExternalOes, Texture);

                GLES20.GlDrawElements(GLES20.GlTriangles, DrawOrder.Length, GLES20.GlUnsignedShort, DrawListBuffer);

                GLES20.GlDisableVertexAttribArray(positionHandle);
                GLES20.GlDisableVertexAttribArray(uvHandle);
                GLES20.GlUseProgram(0);

                if (CallInProgress)
                {
                    AgoraVideoFrame frame = new AgoraVideoFrame();
                    frame.TextureID = Texture;
                    frame.Height = TextureHeight;
                    frame.Stride = TextureWidth;
                    frame.SyncMode = true;
                    frame.Format = AgoraVideoFrame.FormatTextureOes;
                    frame.TimeStamp = Methods.Time.CurrentTimeMillis();
                    frame.EglContext10 = MEglCurrentContext;
                    frame.Transform = Matrix;
                    frame.Rotation = 180;
                    bool success = RtcEngine.PushExternalVideoFrame(frame);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSurfaceChanged(IGL10 gl, int width, int height)
        {
            try
            {
                GLES20.GlViewport(0, 0, width, height);

                int[] textures = new int[1];
                GLES20.GlGenTextures(1, textures, 0);
                Texture = textures[0];

                GLES20.GlBindTexture(GLES11Ext.GlTextureExternalOes, Texture);

                TextureWidth = width;
                TextureHeight = height;


                GLES20.GlTexImage2D(GLES11Ext.GlTextureExternalOes, 0, GLES20.GlRgba, TextureWidth, TextureHeight, 0, GLES20.GlRgba, GLES20.GlUnsignedByte, null);
                GLES20.GlTexParameteri(GLES11Ext.GlTextureExternalOes, GLES20.GlTextureMinFilter, GLES20.GlLinear);
                GLES20.GlTexParameteri(GLES11Ext.GlTextureExternalOes, GLES20.GlTextureMagFilter, GLES20.GlLinear);
                GLES20.GlTexParameteri(GLES11Ext.GlTextureExternalOes, GLES20.GlTextureWrapS, GLES20.GlClampToEdge);
                GLES20.GlTexParameteri(GLES11Ext.GlTextureExternalOes, GLES20.GlTextureWrapT, GLES20.GlClampToEdge);

                SurfaceTexture = new SurfaceTexture(Texture);
                Surface = new Surface(SurfaceTexture);

                SurfaceTexture.SetOnFrameAvailableListener(new OnFrameAvailableListenerClass(this));

                Context.RunOnUiThread(() => DeepAr.SetRenderSurface(Surface, TextureWidth, TextureHeight));
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSurfaceCreated(IGL10 gl, EGLConfig config)
        {
            try
            {
                //GLES20.GlClearColor(1.0f, 0.0f, 0.0f, 1.0f);
                GLES20.GlClearColor(0.0f, 0.0f, 0.0f, 1.0f);

                ByteBuffer bb = ByteBuffer.AllocateDirect(SquareCoords.Length * 4);
                bb.Order(ByteOrder.NativeOrder());
                VertexBuffer = bb.AsFloatBuffer();
                VertexBuffer.Put(SquareCoords);
                VertexBuffer.Position(0);

                ByteBuffer bb2 = ByteBuffer.AllocateDirect(SquareCoords.Length * 4);
                bb2.Order(ByteOrder.NativeOrder());
                Uvbuffer = bb2.AsFloatBuffer();
                Uvbuffer.Put(Uv);
                Uvbuffer.Position(0);

                ByteBuffer dlb = ByteBuffer.AllocateDirect(DrawOrder.Length * 2);
                dlb.Order(ByteOrder.NativeOrder());
                DrawListBuffer = dlb.AsShortBuffer();
                DrawListBuffer.Put(DrawOrder);
                DrawListBuffer.Position(0);

                int vertexShader = LoadShader(GLES20.GlVertexShader, VertexShaderCode);
                int fragmentShader = LoadShader(GLES20.GlFragmentShader, FragmentShaderCode);

                Program = GLES20.GlCreateProgram();
                GLES20.GlAttachShader(Program, vertexShader);
                GLES20.GlAttachShader(Program, fragmentShader);
                GLES20.GlLinkProgram(Program);

                Android.Opengl.Matrix.SetIdentityM(Matrix, 0);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public bool IsCallInProgress()
        {
            return CallInProgress;
        }

        public void SetCallInProgress(bool callInProgress)
        {
            CallInProgress = callInProgress;
        }

        private class OnFrameAvailableListenerClass : Object, SurfaceTexture.IOnFrameAvailableListener
        {
            private readonly DeepArRenderer OuterInstance;

            public OnFrameAvailableListenerClass(DeepArRenderer outerInstance)
            {
                OuterInstance = outerInstance;
            }

            public void OnFrameAvailable(SurfaceTexture surfaceTexture)
            {
                OuterInstance.UpdateTexImage = true;
            }
        }

        public class MyContextFactory : Object, GLSurfaceView.IEGLContextFactory
        {

            internal DeepArRenderer Renderer;
            public MyContextFactory(DeepArRenderer renderer)
            {
                Renderer = renderer;
            }

            public Javax.Microedition.Khronos.Egl.EGLContext CreateContext(IEGL10 egl, Javax.Microedition.Khronos.Egl.EGLDisplay display, EGLConfig eglConfig)
            {
                int[] attribList = new int[] { EGL14.EglContextClientVersion, 2, IEGL10.EglNone };
                Renderer.MEglCurrentContext = egl.EglCreateContext(display, eglConfig, IEGL10.EglNoContext, attribList);
                return Renderer.MEglCurrentContext;
            }

            public void DestroyContext(IEGL10 egl, Javax.Microedition.Khronos.Egl.EGLDisplay display, Javax.Microedition.Khronos.Egl.EGLContext context)
            {
                if (!egl.EglDestroyContext(display, context))
                {
                }
            }
        }


    }
}

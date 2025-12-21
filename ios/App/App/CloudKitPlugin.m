#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CloudKitPlugin, "CloudKit",
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(signInWithApple, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(signInWithGoogle, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentUser, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(signOut, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(saveMemory, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(updateMemory, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(deleteMemory, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(fetchMemories, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(uploadMedia, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(deleteMedia, CAPPluginReturnPromise);
)

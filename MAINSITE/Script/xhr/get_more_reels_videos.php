<?php 
if ($f == "get_more_reels_videos") {
    $html = '';
    if (isset($_GET['user_id']) && isset($_GET['after_last_id'])) {
        foreach (Wo_GetPosts(array(
            'filter_by' => 'video',
            'publisher_id' => $_GET['user_id'],
            'limit' => 10,
            'after_post_id' => $_GET['after_last_id'],
            'is_reel' => 'only',
        )) as $wo['story']) {
            if (isset($wo['story']['postFile']) && !empty($wo['story']['postFile'])) {
                $html .= '<div class="text-center video-data" data-reels-video-id="'.$wo['story']['post_id'].'">
                                            <a href="'. Wo_SeoLink('index.php?link1=reels&id=' . $wo['story']['post_id'] . '&user=' . $wo['story']['publisher']['username'] ).'"
                                               data-ajax="?link1=reels&id='.$wo['story']['post_id'].'&user='.$wo['story']['publisher']['username'].'">

                                            <video><source src="'.Wo_GetMedia($wo['story']['postFile']).'" type="video/mp4"></video>
                                                <div style="position: absolute;background: aliceblue;">
                    <svg xmlns="http://www.w3.org/2000/svg" class="feather-thumbs-down" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"></path></svg>
                    <p id="video-views-count-'.$wo['story']['id'].'">'.$wo['story']['videoViews'].'</p>
                </div>
                                            </a>
                                        </div>';
            }
        }
    }
    $data = array(
        'status' => 200,
        'html' => $html
    );
    header("Content-type: application/json");
    echo json_encode($data);
    exit();
}

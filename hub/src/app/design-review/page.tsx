import {notFound} from 'next/navigation'
import {DesignReviewCatalog} from './review-catalog'
export default function DesignReviewPage(){
 if(process.env.NEXT_PUBLIC_DESIGN_REVIEW!=='1')notFound()
 return <DesignReviewCatalog/>
}
